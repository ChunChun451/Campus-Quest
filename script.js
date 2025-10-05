// Import Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { 
    getFirestore,
    collection, 
    doc, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    where,
    writeBatch,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for performance
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

let tasksUnsubscribe = null;
let notificationsUnsubscribe = null;

onAuthStateChanged(auth, user => {
    if (user && user.emailVerified) {
        console.log("User is logged in:", user);
        updateAuthUI(user);
        displayTasks();
        displayNotifications();
    } else {
        console.log("User is logged out.");
        updateAuthUI(null);
        
        // Clean up listeners
        if (tasksUnsubscribe) {
            tasksUnsubscribe();
            tasksUnsubscribe = null;
        }
        if (notificationsUnsubscribe) {
            notificationsUnsubscribe();
            notificationsUnsubscribe = null;
        }
        
        const taskListContainer = document.querySelector('.task-list');
        if (taskListContainer) {
            taskListContainer.innerHTML = '<div class="no-tasks">Please log in to see tasks.</div>';
        }
    }
});

async function displayTasks() {
    const taskListContainer = document.querySelector('.task-list');
    if (!db || !taskListContainer) return;
    
    // Clean up existing listener
    if (tasksUnsubscribe) {
        tasksUnsubscribe();
    }
    
    // Show loading state
    taskListContainer.innerHTML = '<div class="loading">Loading tasks...</div>';
    
    try {
        const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
        tasksUnsubscribe = onSnapshot(q, async (snapshot) => {
            taskListContainer.innerHTML = '';
            if (snapshot.empty) {
                taskListContainer.innerHTML = '<div class="no-tasks">No tasks available yet. Be the first to post one!</div>';
                return;
            }
            
            // Process tasks and fetch usernames
            const tasks = [];
            for (const doc of snapshot.docs) {
                const task = { id: doc.id, ...doc.data() };
                
                // Skip closed tasks (assigned tasks)
                if (task.status === 'closed') {
                    continue;
                }
                
                // Get username for creator
                const username = await getUsernameByEmail(task.creator);
                task.creatorDisplay = username || task.creator.split('@')[0];
                tasks.push(task);
            }
            
            // Display tasks
            tasks.forEach(task => {
                const taskCard = document.createElement('div');
                taskCard.className = 'task-card';
                
                // Format creation date
                const createdDate = task.createdAt ? new Date(task.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown';
                
                // Check if current user has applied
                const currentUser = auth.currentUser;
                const hasApplied = currentUser && task.applicants && task.applicants.includes(currentUser.email);
                const isCreator = currentUser && task.creator === currentUser.email;
                
                let buttonHtml = '';
                if (isCreator) {
                        buttonHtml = '<button class="apply-btn" disabled style="background: #6c757d;">Your Task</button>';
                } else if (hasApplied) {
                    buttonHtml = '<button class="apply-btn" disabled style="background: #28a745;">Applied</button>';
                } else {
                    buttonHtml = `<button class="apply-btn" data-task-id="${task.id}" data-creator-email="${task.creator}">Apply</button>`;
                }
                
                const applicantCount = task.applicants ? task.applicants.length : 0;
                
                // Format reward with rupee symbol
                const formattedReward = `₹${task.reward}`;
                
                taskCard.innerHTML = `
                    <h3>${escapeHtml(task.title)}</h3>
                    <p>${escapeHtml(task.description)}</p>
                    <div class="task-meta">
                        <span class="reward">${formattedReward}</span>
                        <span class="creator">Posted by: ${escapeHtml(task.creatorDisplay)}</span>
                        <span class="date">${createdDate}</span>
                        <span class="applicants">${applicantCount} applicant${applicantCount !== 1 ? 's' : ''}</span>
                    </div>
                    ${buttonHtml}
                `;
                taskListContainer.appendChild(taskCard);
            });
        }, (error) => {
            console.error('Error in tasks listener:', error);
            taskListContainer.innerHTML = '<div class="error">Failed to load tasks. Please refresh the page.</div>';
        });
    } catch (error) {
        console.error('Error setting up tasks listener:', error);
        taskListContainer.innerHTML = '<div class="error">Error loading tasks. Please check your connection and try again.</div>';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const currentUser = auth.currentUser;
    const submitButton = event.target.querySelector('button[type="submit"]');

    if (!currentUser) {
        showErrorMessage('Please sign in to post a task');
        return;
    }
    
    const taskTitle = document.getElementById('task-title').value.trim();
    const description = document.getElementById('description').value.trim();
    const rewardValue = document.getElementById('reward').value;
    
    if (!taskTitle || !description || !rewardValue) {
        showErrorMessage('Please fill in all fields');
        return;
    }
    
    if (taskTitle.length > 100) {
        showErrorMessage('Task title must be less than 100 characters');
        return;
    }
    
    if (description.length > 500) {
        showErrorMessage('Description must be less than 500 characters');
        return;
    }
    
    // Validate reward amount
    const reward = parseInt(rewardValue);
    if (isNaN(reward) || reward < 1 || reward > 10000) {
        showErrorMessage('Reward must be between ₹1 and ₹10,000');
        return;
    }
    
    // Show loading state
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Posting...';
    submitButton.disabled = true;
    
    try {
        await addDoc(collection(db, 'tasks'), {
            title: taskTitle,
            description: description,
            reward: reward,
            creator: currentUser.email,
            applicants: [],
            createdAt: serverTimestamp(),
            status: 'open'
        });
        document.getElementById('task-form').reset();
        showSuccessMessage('Task posted successfully!');
    } catch (error) {
        console.error('Error posting task:', error);
        if (error.code === 'permission-denied') {
            showErrorMessage('Permission denied. Please check your account status.');
        } else if (error.code === 'unavailable') {
            showErrorMessage('Service temporarily unavailable. Please try again later.');
        } else {
            showErrorMessage('Failed to post task. Please check your connection and try again.');
        }
    } finally {
        // Reset button state
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

function showSuccessMessage(message) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.textContent = message;
    document.body.appendChild(successMessage);
    setTimeout(() => successMessage.classList.add('show'), 10);
    setTimeout(() => {
        successMessage.classList.remove('show');
        setTimeout(() => document.body.removeChild(successMessage), 300);
    }, 3000);
}

function showErrorMessage(message) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = message;
    document.body.appendChild(errorMessage);
    setTimeout(() => errorMessage.classList.add('show'), 10);
    setTimeout(() => {
        errorMessage.classList.remove('show');
        setTimeout(() => document.body.removeChild(errorMessage), 300);
    }, 4000);
}

document.addEventListener('click', async function(event) {
    // Individual notification close button
    if (event.target && event.target.classList.contains('notif-close')) {
        const notificationId = event.target.dataset.notificationId;
        if (notificationId) {
            try {
                await deleteDoc(doc(db, 'notifications', notificationId));
                console.log('Individual notification deleted:', notificationId);
            } catch (error) {
                console.error('Error deleting notification:', error);
            }
        }
        return;
    }
    
    // Clear all notifications via delegation
    if (event.target && event.target.id === 'clear-notifications') {
        try { await clearAllNotifications(); } catch (e) { console.error('Clear all failed:', e); }
        return;
    }
    if (event.target.classList.contains('assign-btn')) {
        const taskId = event.target.dataset.taskId;
        const applicantEmail = event.target.dataset.applicant;
        const notificationId = event.target.dataset.notificationId;
        
        await assignTask(taskId, applicantEmail, notificationId);
    } else if (event.target.classList.contains('apply-btn')) {
        const taskId = event.target.dataset.taskId;
        const creatorEmail = event.target.dataset.creatorEmail;
        const currentUser = auth.currentUser;
        const button = event.target;

        if (!currentUser) {
            showErrorMessage('Please sign in to apply for tasks');
            return;
        }

        if (creatorEmail === currentUser.email) {
            showErrorMessage('You cannot apply to your own task!');
            return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = 'Applying...';
        button.disabled = true;

        try {
            const taskRef = doc(db, 'tasks', taskId);
            const taskDoc = await getDoc(taskRef);

            if (!taskDoc.exists()) {
                showErrorMessage('Task not found or has been removed');
                return;
            }

            const task = taskDoc.data();
            
            if (task.status === 'closed') {
                showErrorMessage('This task is no longer accepting applications');
                return;
            }

            if (task.applicants && task.applicants.includes(currentUser.email)) {
                showErrorMessage('You have already applied to this task!');
                return;
            }

            const updatedApplicants = [...(task.applicants || []), currentUser.email];
            await updateDoc(taskRef, { applicants: updatedApplicants });

            await sendNotification(task.creator, `${currentUser.email} has applied to your task: "${task.title}"`, taskId, currentUser.email);
            showSuccessMessage('Your application has been sent successfully!');
            
            // Update button to show applied state
            button.textContent = 'Applied';
            button.style.background = '#28a745';
            button.disabled = true;
            
        } catch (error) {
            console.error('Error applying to task:', error);
            if (error.code === 'permission-denied') {
                showErrorMessage('Permission denied. Please check your account status.');
            } else if (error.code === 'unavailable') {
                showErrorMessage('Service temporarily unavailable. Please try again later.');
            } else {
                showErrorMessage('Failed to apply. Please check your connection and try again.');
            }
        } finally {
            // Reset button state if not applied
            if (button.textContent === 'Applying...') {
                button.textContent = originalText;
                button.disabled = false;
            }
        }
    }
});


// THIS FUNCTION HAS BEEN UPDATED
async function handleSignUp() {
    const email = document.getElementById('new-email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const signupButton = document.getElementById('signup-btn');
    
    if (!email.endsWith('@iitj.ac.in')) {
        showErrorMessage('Only IITJ email accounts are allowed');
        return;
    }
    if (!username || username.length < 3) {
        showErrorMessage('Username must be at least 3 characters long');
        return;
    }
    if (password !== confirmPassword) {
        showErrorMessage('Passwords do not match');
        return;
    }
    if (password.length < 6) {
        showErrorMessage('Password must be at least 6 characters long');
        return;
    }
    if (password.length > 128) {
        showErrorMessage('Password must be less than 128 characters');
        return;
    }
    
    // Show loading state
    const originalText = signupButton.textContent;
    signupButton.textContent = 'Creating Account...';
    signupButton.disabled = true;
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save user data to Firestore
        await addDoc(collection(db, 'users'), {
            email: email,
            username: username,
            auroraRatings: [],
            voyagerRatings: [],
            createdAt: serverTimestamp()
        });
        
        await sendEmailVerification(userCredential.user);
        showSuccessMessage('Account created! Please check your IITJ email to verify your account before logging in.');
        document.getElementById('signup-form').reset();
        showSignInForm();
    } catch (error) {
        console.error('Sign up error:', error);
        if (error.code === 'auth/email-already-in-use') {
            showErrorMessage('This email is already in use. Please sign in instead.');
        } else if (error.code === 'auth/invalid-email') {
            showErrorMessage('Please enter a valid IITJ email address');
        } else if (error.code === 'auth/weak-password') {
            showErrorMessage('Password is too weak. Please choose a stronger password.');
        } else if (error.code === 'auth/network-request-failed') {
            showErrorMessage('Network error. Please check your connection and try again.');
        } else {
            showErrorMessage('Failed to create account. Please try again later.');
        }
    } finally {
        // Reset button state
        signupButton.textContent = originalText;
        signupButton.disabled = false;
    }
}

async function handleLogIn() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const signinButton = document.getElementById('signin-btn');
    
    if (!email || !password) {
        showErrorMessage('Please enter both email and password');
        return;
    }
    
    // Show loading state
    const originalText = signinButton.textContent;
    signinButton.textContent = 'Signing In...';
    signinButton.disabled = true;
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            showErrorMessage('Your account is not verified. A new verification link has been sent to your email. Please check your inbox.');
        } else {
            showSuccessMessage('Welcome back!');
        }
    } catch (error) {
        console.error('Login error:', error.code);
        if (error.code === 'auth/user-not-found') {
            showErrorMessage('No account found with this email address');
        } else if (error.code === 'auth/wrong-password') {
            showErrorMessage('Incorrect password');
        } else if (error.code === 'auth/invalid-email') {
            showErrorMessage('Please enter a valid email address');
        } else if (error.code === 'auth/too-many-requests') {
            showErrorMessage('Too many failed attempts. Please try again later.');
        } else if (error.code === 'auth/network-request-failed') {
            showErrorMessage('Network error. Please check your connection and try again.');
        } else {
            showErrorMessage('Invalid email or password');
        }
    } finally {
        // Reset button state
        signinButton.textContent = originalText;
        signinButton.disabled = false;
    }
}

async function handleLogOut() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

function showSignInForm() {
    document.getElementById('signin-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('signin-toggle').classList.add('active');
    document.getElementById('signup-toggle').classList.remove('active');
}

function showSignUpForm() {
    document.getElementById('signin-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('signin-toggle').classList.remove('active');
    document.getElementById('signup-toggle').classList.add('active');
}

function updateAuthUI(user) {
    const signinModal = document.getElementById('signin-modal');
    const mainContent = document.getElementById('main-content');
    const userInfo = document.getElementById('user-info');
    const profileContainer = document.getElementById('profile-container');
    
    if (user) {
        signinModal.style.display = 'none';
        mainContent.style.display = 'grid';
        userInfo.style.display = 'flex';
        document.getElementById('current-user').textContent = user.email;
        document.getElementById('notification-bell').style.display = 'block';
        profileContainer.style.display = 'block';
        
        // Update profile dropdown
        updateProfileDropdown(user);
    } else {
        signinModal.style.display = 'flex';
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        document.getElementById('notification-bell').style.display = 'none';
        profileContainer.style.display = 'none';
    }
}

async function updateProfileDropdown(user) {
    try {
        // Get user data from Firestore
        const q = query(collection(db, 'users'), where('email', '==', user.email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            document.getElementById('profile-username').textContent = userData.username;
        } else {
            // Fallback to email if username not found
            document.getElementById('profile-username').textContent = user.email.split('@')[0];
        }
        
        document.getElementById('profile-email').textContent = user.email;
    } catch (error) {
        console.error('Error fetching user data:', error);
        // Fallback to email
        document.getElementById('profile-username').textContent = user.email.split('@')[0];
        document.getElementById('profile-email').textContent = user.email;
    }
}

async function getUsernameByEmail(email) {
    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return snapshot.docs[0].data().username;
        }
        return null;
    } catch (error) {
        console.error('Error fetching username:', error);
        return null;
    }
}

async function sendNotification(userEmail, message, taskId = null, applicantEmail = null) {
    try {
        await addDoc(collection(db, 'notifications'), {
            user: userEmail,
            message: message,
            timestamp: serverTimestamp(),
            read: false,
            taskId: taskId,
            applicantEmail: applicantEmail,
            type: taskId ? 'application' : 'general'
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

async function displayNotifications() {
    const currentUser = auth.currentUser;
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const clearBtn = document.getElementById('clear-notifications');
    
    if (!currentUser || !notificationList) return;
    
    // Clean up existing listener
    if (notificationsUnsubscribe) {
        notificationsUnsubscribe();
    }
    
    const q = query(collection(db, 'notifications'), where("user", "==", currentUser.email), orderBy('timestamp', 'desc'));
    
    notificationsUnsubscribe = onSnapshot(q, (snapshot) => {
        notificationList.innerHTML = '';
        const unreadCount = snapshot.docs.filter(doc => !doc.data().read).length;
        // Update badge visibility
        if (unreadCount > 0) {
        notificationCount.textContent = unreadCount;
            notificationCount.style.display = 'flex';
        } else {
            notificationCount.textContent = '';
            notificationCount.style.display = 'none';
        }
        // Enable/disable Clear All
        if (clearBtn) clearBtn.disabled = snapshot.empty;
        
        if (snapshot.empty) {
            notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
            return;
        }
        
        snapshot.forEach(doc => {
            const notif = { id: doc.id, ...doc.data() };
            const notifElement = document.createElement('div');
            notifElement.className = `notification-item ${notif.read ? 'read' : 'unread'}`;
            const timestamp = notif.timestamp ? new Date(notif.timestamp.seconds * 1000).toLocaleString() : 'Just now';
            
            let actionButton = '';
            console.log('Processing notification:', notif); // Debug log
            
            // Check if this is an application notification and we have the required data
            if (notif.type === 'application' && notif.taskId && notif.applicantEmail) {
                actionButton = `<button class="assign-btn" data-task-id="${notif.taskId}" data-applicant="${notif.applicantEmail}" data-notification-id="${notif.id}">Assign Task</button>`;
                console.log('Added assign button for application notification:', notif.id); // Debug log
            } else if (!notif.type && notif.message && notif.message.includes('has applied to your task')) {
                // Handle legacy notifications that don't have the type field
                // Extract task ID and applicant email from the message or use fallback
                const applicantMatch = notif.message.match(/([^\s]+@[^\s]+)\s+has applied to your task:/);
                if (applicantMatch && notif.taskId) {
                    actionButton = `<button class="assign-btn" data-task-id="${notif.taskId}" data-applicant="${applicantMatch[1]}" data-notification-id="${notif.id}">Assign Task</button>`;
                    console.log('Added assign button for legacy notification:', notif.id); // Debug log
                }
            }
            
            notifElement.innerHTML = `
                <span class="notif-close" data-notification-id="${notif.id}">&times;</span>
                <p>${notif.message}</p>
                <small>${timestamp}</small>
                ${actionButton}
            `;
            
            notifElement.addEventListener('click', (e) => {
                if (!e.target.classList.contains('assign-btn') && !e.target.classList.contains('notif-close')) {
                    markNotificationAsRead(notif.id);
                }
            });
            
            notificationList.appendChild(notifElement);
        });
    }, error => {
        console.error("Error fetching notifications:", error);
    });
}

async function markNotificationAsRead(notificationId) {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function clearAllNotifications() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const q = query(collection(db, 'notifications'), where("user", "==", currentUser.email));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    // Optimistically update UI
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const clearBtn = document.getElementById('clear-notifications');
    if (notificationList) notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
    if (notificationCount) { notificationCount.textContent = ''; notificationCount.style.display = 'none'; }
    if (clearBtn) clearBtn.disabled = true;
}

async function clearAllTasks() {
    try {
        console.log('Starting to clear all tasks...');
        
        // Get all tasks
        const q = query(collection(db, 'tasks'));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            console.log('No tasks to clear');
            showSuccessMessage('No tasks found to clear');
            return;
        }
        
        console.log(`Found ${snapshot.docs.length} tasks to delete`);
        
        // Delete in batches (Firestore batch limit is 500)
        const batch = writeBatch(db);
        let batchCount = 0;
        
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            batchCount++;
            
            // Commit batch when it reaches 500 operations
            if (batchCount >= 500) {
                batch.commit();
                batchCount = 0;
            }
        });
        
        // Commit remaining operations
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log('All tasks cleared successfully');
        showSuccessMessage(`Successfully cleared ${snapshot.docs.length} tasks`);
        
    } catch (error) {
        console.error('Error clearing tasks:', error);
        showErrorMessage('Failed to clear tasks. Please try again.');
    }
}

function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = '🙈';
    } else {
        input.type = 'password';
        icon.textContent = '👁️';
    }
}

function renderStarRating(rating, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const stars = container.querySelectorAll('.star');
    const textElement = container.querySelector('.rating-text');
    
    if (rating === 0) {
        stars.forEach(star => {
            star.textContent = '☆';
            star.classList.remove('filled');
            star.classList.add('empty');
        });
        textElement.textContent = 'No ratings yet';
    } else {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        
        stars.forEach((star, index) => {
            if (index < fullStars) {
                star.textContent = '⭐';
                star.classList.add('filled');
                star.classList.remove('empty');
            } else if (index === fullStars && hasHalfStar) {
                star.textContent = '⭐';
                star.classList.add('filled');
                star.classList.remove('empty');
            } else {
                star.textContent = '☆';
                star.classList.remove('filled');
                star.classList.add('empty');
            }
        });
        
        textElement.textContent = `${rating.toFixed(1)}/5.0`;
    }
}

async function loadUserRatings() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    try {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            const auroraRatings = userData.auroraRatings || [];
            const voyagerRatings = userData.voyagerRatings || [];
            
            const auroraAverage = auroraRatings.length > 0 
                ? auroraRatings.reduce((sum, rating) => sum + rating, 0) / auroraRatings.length 
                : 0;
            const voyagerAverage = voyagerRatings.length > 0 
                ? voyagerRatings.reduce((sum, rating) => sum + rating, 0) / voyagerRatings.length 
                : 0;
            
            renderStarRating(auroraAverage, 'aurora-rating');
            renderStarRating(voyagerAverage, 'voyager-rating');
        }
    } catch (error) {
        console.error('Error loading user ratings:', error);
    }
}

function showRatingModal() {
    const modal = document.getElementById('rating-modal');
    modal.classList.add('show');
    loadUserRatings();
}

function hideRatingModal() {
    const modal = document.getElementById('rating-modal');
    modal.classList.remove('show');
}

async function addRatingToUser(userEmail, ratingType, rating) {
    try {
        const q = query(collection(db, 'users'), where('email', '==', userEmail));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            const userData = userDoc.data();
            
            const ratingsArray = ratingType === 'aurora' ? 'auroraRatings' : 'voyagerRatings';
            const currentRatings = userData[ratingsArray] || [];
            
            await updateDoc(userDoc.ref, {
                [ratingsArray]: [...currentRatings, rating]
            });
            
            console.log(`Added ${ratingType} rating ${rating} to user ${userEmail}`);
        }
    } catch (error) {
        console.error('Error adding rating to user:', error);
    }
}

async function testRating(userEmail, ratingType, rating) {
    await addRatingToUser(userEmail, ratingType, rating);
    console.log(`Test: Added ${ratingType} rating ${rating} to ${userEmail}`);
}

async function assignTask(taskId, applicantEmail, notificationId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showErrorMessage('Please sign in to assign tasks');
        return;
    }

    try {
        // Get task details
        const taskRef = doc(db, 'tasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (!taskDoc.exists()) {
            showErrorMessage('Task not found');
            return;
        }
        
        const task = taskDoc.data();
        
        // Verify the current user is the task creator
        if (task.creator !== currentUser.email) {
            showErrorMessage('Only the task creator can assign tasks');
            return;
        }
        
        // Check if task is already assigned
        if (task.status === 'closed' && task.assignedTo) {
            showErrorMessage('This task has already been assigned');
            return;
        }
        
        // Update task with assigned user and status
        await updateDoc(taskRef, {
            assignedTo: applicantEmail,
            status: 'closed', // Mark as closed to remove from available tasks
            assignedAt: serverTimestamp()
        });
        
        // Send notification to the assigned user
        await sendNotification(applicantEmail, `Congratulations! You have been assigned the task: "${task.title}". Reward: ₹${task.reward}`);
        
        // Mark the notification as read
        await markNotificationAsRead(notificationId);
        
        // Send notification to task creator
        await sendNotification(currentUser.email, `Task "${task.title}" has been assigned to ${applicantEmail}`);
        
        showSuccessMessage(`Task assigned to ${applicantEmail} successfully!`);
        
        // Close notification panel
        hideNotificationPanel();
        
    } catch (error) {
        console.error('Error assigning task:', error);
        if (error.code === 'permission-denied') {
            showErrorMessage('Permission denied. Please check your account status.');
        } else if (error.code === 'unavailable') {
            showErrorMessage('Service temporarily unavailable. Please try again later.');
        } else {
            showErrorMessage('Failed to assign task. Please try again.');
        }
    }
}


function showNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    const overlay = document.getElementById('notification-overlay');
    // ensure visible via style in addition to class for robustness
    panel.style.display = 'block';
    panel.classList.add('show');
    overlay.classList.add('show');
}

// Debug function to test notification display
async function createTestNotification() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        console.log("No user logged in");
        return;
    }
    
    try {
        // Create a test notification with assign button in the database
        await addDoc(collection(db, 'notifications'), {
            user: currentUser.email,
            message: "test@iitj.ac.in has applied to your task: \"Test Task\"",
            timestamp: serverTimestamp(),
            read: false,
            taskId: "test-task-id",
            applicantEmail: "test@iitj.ac.in",
            type: "application"
        });
        
        console.log("Test notification created and added to database");
        showSuccessMessage("Test notification created! Check your notifications.");
    } catch (error) {
        console.error("Error creating test notification:", error);
        showErrorMessage("Failed to create test notification");
    }
}

function hideNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    const overlay = document.getElementById('notification-overlay');
    panel.classList.remove('show');
    overlay.classList.remove('show');
    panel.style.display = 'none';
}

// Character counting functionality
function setupCharacterCounters() {
    const titleInput = document.getElementById('task-title');
    const descInput = document.getElementById('description');
    const titleCount = document.getElementById('title-count');
    const descCount = document.getElementById('desc-count');
    
    function updateCharCount(input, counter, max) {
        const count = input.value.length;
        counter.textContent = `${count}/${max} characters`;
        
        // Update styling based on usage
        counter.classList.remove('warning', 'error');
        if (count > max * 0.8) {
            counter.classList.add('warning');
        }
        if (count > max * 0.95) {
            counter.classList.add('error');
        }
    }
    
    if (titleInput && titleCount) {
        const debouncedUpdate = debounce(() => updateCharCount(titleInput, titleCount, 100), 100);
        titleInput.addEventListener('input', debouncedUpdate);
    }
    
    if (descInput && descCount) {
        const debouncedUpdate = debounce(() => updateCharCount(descInput, descCount, 500), 100);
        descInput.addEventListener('input', debouncedUpdate);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('signin-btn').addEventListener('click', handleLogIn);
    document.getElementById('signup-btn').addEventListener('click', handleSignUp);
    document.getElementById('signout-btn').addEventListener('click', handleLogOut);
    document.getElementById('signin-toggle').addEventListener('click', showSignInForm);
    document.getElementById('signup-toggle').addEventListener('click', showSignUpForm);
    // Bell icon toggle functionality
    document.getElementById('bell-icon').addEventListener('click', function() {
        const panel = document.getElementById('notification-panel');
        const overlay = document.getElementById('notification-overlay');
        
        if (panel.classList.contains('show')) {
            // Hide panel
            panel.classList.remove('show');
            overlay.classList.remove('show');
            panel.style.display = 'none';
        } else {
            // Show panel
            panel.classList.add('show');
            overlay.classList.add('show');
            panel.style.display = 'block';
        }
    });
    
    // Global functions for onclick handlers
    window.closeNotificationPanel = function() {
        console.log('Close button clicked via onclick!');
        const panel = document.getElementById('notification-panel');
        const overlay = document.getElementById('notification-overlay');
        panel.classList.remove('show');
        overlay.classList.remove('show');
        panel.style.display = 'none';
    };
    
    window.clearAllAndClose = function() {
        console.log('Clear All button clicked via onclick!');
        // Empty the notification list
        const notificationList = document.getElementById('notification-list');
        notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
        
        // Clear from database
        clearAllNotifications();
        
        // Hide the panel
        const panel = document.getElementById('notification-panel');
        const overlay = document.getElementById('notification-overlay');
        panel.classList.remove('show');
        overlay.classList.remove('show');
        panel.style.display = 'none';
    };
    
    // Overlay click does nothing (only close button should close)
    document.getElementById('notification-overlay').addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Profile dropdown functionality
    const profileIcon = document.getElementById('profile-icon');
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileSignout = document.getElementById('profile-signout');
    
    if (profileIcon && profileDropdown) {
        profileIcon.addEventListener('click', function(e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!profileIcon.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('show');
            }
        });
        
        // Sign out functionality
        if (profileSignout) {
            profileSignout.addEventListener('click', function() {
                handleLogOut();
                profileDropdown.classList.remove('show');
            });
        }
        
        // Rating modal functionality
        const profileRating = document.getElementById('profile-rating');
        const ratingModal = document.getElementById('rating-modal');
        const ratingModalClose = document.getElementById('rating-modal-close');
        
        if (profileRating) {
            profileRating.addEventListener('click', function() {
                showRatingModal();
                profileDropdown.classList.remove('show');
            });
        }
        
        if (ratingModalClose) {
            ratingModalClose.addEventListener('click', hideRatingModal);
        }
        
        // Close rating modal when clicking outside
        if (ratingModal) {
            ratingModal.addEventListener('click', function(e) {
                if (e.target === ratingModal) {
                    hideRatingModal();
                }
            });
        }
    }
    
    setupCharacterCounters();
    
    window.createTestNotification = createTestNotification;
    window.clearAllNotifications = clearAllNotifications;
    window.clearAllTasks = clearAllTasks;
    window.togglePassword = togglePassword;
    window.addRatingToUser = addRatingToUser;
    window.testRating = testRating;
});