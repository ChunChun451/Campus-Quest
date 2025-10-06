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

onAuthStateChanged(auth, async user => {
    if (user && user.emailVerified) {
        console.log("User is logged in:", user);
        await updateAuthUI(user);
        displayTasks();
        displayNotifications();
    } else {
        console.log("User is logged out.");
        await updateAuthUI(null);
        
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

function saveTaskToStorage(task) {
    try {
        const tasks = getTasksFromStorage();
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        task.id = taskId;
        tasks.push(task);
        localStorage.setItem('campus_quest_tasks', JSON.stringify(tasks));
        return taskId;
    } catch (error) {
        console.error('Error saving task to localStorage:', error);
        return null;
    }
}

function getTasksFromStorage() {
    try {
        const tasks = localStorage.getItem('campus_quest_tasks');
        return tasks ? JSON.parse(tasks) : [];
    } catch (error) {
        console.error('Error reading tasks from localStorage:', error);
        return [];
    }
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
    const deadlineDate = document.getElementById('deadline-date').value;
    const deadlineTime = document.getElementById('deadline-time').value;
    
    if (!taskTitle || !description || !rewardValue || !deadlineDate || !deadlineTime) {
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
    
    // Validate deadline (must be in the future)
    const deadlineDateTime = new Date(`${deadlineDate}T${deadlineTime}`);
    const currentDateTime = new Date();
    
    if (deadlineDateTime <= currentDateTime) {
        showErrorMessage('Deadline must be in the future. Please select a date and time that is later than now.');
        return;
    }
    
    // Format deadline as ISO string for storage
    const deadlineISO = deadlineDateTime.toISOString();
    
    // Show loading state
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Posting...';
    submitButton.disabled = true;
    
    try {
        // Create task object
        const taskData = {
            title: taskTitle,
            description: description,
            reward: reward,
            creator: currentUser.email,
            applicants: [],
            createdAt: new Date().toISOString(),
            status: 'open',
            deadline: deadlineISO
        };
        
        // Save to Firestore
        await addDoc(collection(db, 'tasks'), taskData);
        
        // Also save to localStorage for GitHub Pages compatibility
        saveTaskToStorage(taskData);
        
        document.getElementById('task-form').reset();
        showSuccessMessage('Task posted successfully!');
        
        // Hide the task creation form after successful submission
        const taskFormContainer = document.getElementById('newTaskFormContainer');
        const mainContent = document.getElementById('main-content');
        if (taskFormContainer && mainContent) {
            taskFormContainer.style.display = 'none';
            mainContent.classList.remove('form-visible'); // Remove class for layout adjustment
        }
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
        console.log('Assign button clicked!'); // Debug log
        event.preventDefault();
        event.stopPropagation();
        
        const taskId = event.target.dataset.taskId;
        const applicantEmail = event.target.dataset.applicant;
        const notificationId = event.target.dataset.notificationId;
        
        console.log('Assign button data:', { taskId, applicantEmail, notificationId }); // Debug log
        
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
    const username = document.getElementById('new-username').value.trim();
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
            questmasterRatings: [],
            voyagerRatings: [],
            createdAt: serverTimestamp()
        });
        
        // Also save to localStorage for GitHub Pages compatibility
        const userData = {
            email: email,
            username: username,
            questmasterRatings: [],
            voyagerRatings: [],
            createdAt: new Date().toISOString()
        };
        saveUserDataToStorage(email, userData);
        
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
    document.getElementById('modal-subtitle').textContent = 'Please sign in to access the task board';
}

function showSignUpForm() {
    document.getElementById('signin-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('signin-toggle').classList.remove('active');
    document.getElementById('signup-toggle').classList.add('active');
    document.getElementById('modal-subtitle').textContent = 'Create an IITJ Account to get started';
}

async function updateAuthUI(user) {
    const signinModal = document.getElementById('signin-modal');
    const mainContent = document.getElementById('main-content');
    const userInfo = document.getElementById('user-info');
    const profileContainer = document.getElementById('profile-container');
    const mainNav = document.getElementById('main-nav');
    
    if (user) {
        signinModal.style.display = 'none';
        mainContent.style.display = 'grid';
        userInfo.style.display = 'flex';
        mainNav.style.display = 'flex';
        
        // Update welcome message with username
        await updateWelcomeMessage(user);
        
        document.getElementById('notification-bell').style.display = 'block';
        profileContainer.style.display = 'block';
        
        // Update profile dropdown
        updateProfileDropdown(user);
    } else {
        signinModal.style.display = 'flex';
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        mainNav.style.display = 'none';
        document.getElementById('notification-bell').style.display = 'none';
        profileContainer.style.display = 'none';
    }
}

async function updateWelcomeMessage(user) {
    try {
        // Get user data from localStorage
        const userData = getUserDataFromStorage(user.email);
        document.getElementById('current-user').textContent = userData.username;
    } catch (error) {
        console.error('Error fetching username for welcome message:', error);
        // Fallback to email prefix
        document.getElementById('current-user').textContent = user.email.split('@')[0];
    }
}

function updateProfileDropdown(user) {
    try {
        // Get user data from localStorage
        const userData = getUserDataFromStorage(user.email);
        
        // Update username field
        const usernameInput = document.getElementById('profile-username-input');
        if (usernameInput) {
            usernameInput.value = userData.username || user.email.split('@')[0];
        }
        
        // Update email display
        const emailDisplay = document.getElementById('profile-email-display');
        if (emailDisplay) {
            emailDisplay.textContent = user.email;
        }
        
        // Update ratings
        renderStarRating(calculateAverageRating(userData.questmasterRatings), 'questmaster-rating');
        renderStarRating(calculateAverageRating(userData.voyagerRatings), 'voyager-rating');
        
    } catch (error) {
        console.error('Error updating profile dropdown:', error);
        // Fallback values
        const usernameInput = document.getElementById('profile-username-input');
        if (usernameInput) {
            usernameInput.value = user.email.split('@')[0];
        }
        const emailDisplay = document.getElementById('profile-email-display');
        if (emailDisplay) {
            emailDisplay.textContent = user.email;
        }
    }
}

async function handleSaveProfileChanges() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const newUsername = document.getElementById('profile-username-input').value.trim();
    if (!newUsername || newUsername.length < 3) {
        showErrorMessage('Username must be at least 3 characters long');
        return;
    }
    
    // 1. Update Firestore
    try {
        const q = query(collection(db, 'users'), where('email', '==', currentUser.email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const userDocRef = doc(db, 'users', snapshot.docs[0].id);
            await updateDoc(userDocRef, { username: newUsername });
            
            // 2. Update Local Storage
            const userData = getUserDataFromStorage(currentUser.email);
            userData.username = newUsername;
            saveUserDataToStorage(currentUser.email, userData);
            
            // 3. Update UI
            await updateWelcomeMessage(currentUser);
            showSuccessMessage('Username updated successfully!');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showErrorMessage('Failed to update username. Please try again.');
    }
}

function getUserDataFromStorage(email) {
    try {
        const userData = localStorage.getItem(`user_${email}`);
        if (userData) {
            return JSON.parse(userData);
        }
        // Return default data if not found
        return { 
            username: email.split('@')[0], 
            email: email, 
            questmasterRatings: [], 
            voyagerRatings: [] 
        };
    } catch (error) {
        console.error('Error reading user data from localStorage:', error);
        return { 
            username: email.split('@')[0], 
            email: email, 
            questmasterRatings: [], 
            voyagerRatings: [] 
        };
    }
}

function saveUserDataToStorage(email, userData) {
    try {
        localStorage.setItem(`user_${email}`, JSON.stringify(userData));
        return true;
    } catch (error) {
        console.error('Error saving user data to localStorage:', error);
        return false;
    }
}

async function getUsernameByEmail(email) {
    try {
        // First try to get from localStorage (faster)
        const userData = getUserDataFromStorage(email);
        if (userData && userData.username) {
            return userData.username;
        }
        
        // If not in localStorage, query Firestore
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
            // Check if this is an application notification and we have the required data
            if (notif.type === 'application' && notif.taskId && notif.applicantEmail) {
                // Check task status before deciding to show 'Assign Task' button
                // This check is performed in assignTask, but for UI clarity, we'll optimistically show it.
                actionButton = `<button class="assign-btn" data-task-id="${notif.taskId}" data-applicant="${notif.applicantEmail}" data-notification-id="${notif.id}">Assign Task</button>`;
            } 
            
            notifElement.innerHTML = `
                <span class="notif-close" data-notification-id="${notif.id}">&times;</span>
                <p>${notif.message}</p>
                <small>${timestamp}</small>
                ${actionButton}
            `;
            
            notifElement.addEventListener('click', (e) => {
                // Only mark as read if clicking on the notification itself, not buttons
                if (!e.target.classList.contains('assign-btn') && !e.target.classList.contains('notif-close') && e.target.tagName !== 'BUTTON') {
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
    
    try {
        const q = query(collection(db, 'notifications'), where("user", "==", currentUser.email));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;
        
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        showSuccessMessage('All notifications cleared.');
    } catch (error) {
        console.error('Error clearing notifications:', error);
        showErrorMessage('Failed to clear notifications.');
    }
}

function closeNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (panel) {
        panel.classList.remove('open');
    }
}

function clearAllAndClose() {
    clearAllNotifications();
    closeNotificationPanel();
}

async function assignTask(taskId, applicantEmail, notificationId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showErrorMessage('You must be signed in to assign a task.');
        return;
    }
    
    try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskDoc = await getDoc(taskRef);

        if (!taskDoc.exists() || taskDoc.data().status === 'closed') {
            showErrorMessage('Task not found or already assigned/closed.');
            return;
        }
        
        const task = taskDoc.data();
        
        if (task.creator !== currentUser.email) {
            showErrorMessage('You can only assign tasks you posted.');
            return;
        }

        // 1. Update Task status
        await updateDoc(taskRef, {
            status: 'closed',
            assignedTo: applicantEmail
        });
        
        // 2. Send notification to the assigned applicant
        const taskTitle = task.title;
        await sendNotification(applicantEmail, `Congratulations! You have been assigned the task: "${taskTitle}". Check your email for next steps.`, taskId);

        // 3. Delete the specific notification that triggered the action
        if (notificationId) {
            await deleteDoc(doc(db, 'notifications', notificationId));
        }

        // 4. Delete all other application notifications for this task
        const otherNotifsQ = query(
            collection(db, 'notifications'), 
            where('taskId', '==', taskId),
            where('type', '==', 'application'),
            where('applicantEmail', '!=', applicantEmail) // Exclude the assigned applicant's notification (already sent congrats)
        );
        const otherNotifsSnapshot = await getDocs(otherNotifsQ);
        const batch = writeBatch(db);
        
        otherNotifsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        showSuccessMessage(`Task "${taskTitle}" successfully assigned to ${applicantEmail}.`);
    } catch (error) {
        console.error('Error assigning task:', error);
        showErrorMessage('Failed to assign task. Please try again.');
    }
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

function calculateAverageRating(ratingsArray) {
    if (!ratingsArray || ratingsArray.length === 0) {
        return 0;
    }
    const sum = ratingsArray.reduce((acc, rating) => acc + rating, 0);
    return sum / ratingsArray.length;
}

function renderStarRating(rating, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const starsContainer = container.querySelector('.stars');
    const textElement = container.querySelector('.rating-text');
    
    if (!starsContainer || !textElement) return;

    // Clear existing stars
    starsContainer.innerHTML = ''; 
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.25 && rating - fullStars < 0.75; // Use half star logic
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
        starsContainer.innerHTML += '<span class="star full">★</span>';
    }

    // Add half star
    if (hasHalfStar) {
        starsContainer.innerHTML += '<span class="star half">✭</span>';
    }

    // Add empty stars
    for (let i = 0; i < emptyStars; i++) {
        starsContainer.innerHTML += '<span class="star empty">☆</span>';
    }
    
    if (rating > 0) {
        textElement.textContent = `${rating.toFixed(2)} out of 5 (${containerId.includes('questmaster') ? 'QuestMaster' : 'Voyager'} Rating)`;
    } else {
        textElement.textContent = 'No ratings yet';
    }
}


function showRatingModal() {
    const ratingModal = document.getElementById('rating-modal');
    if (ratingModal) {
        ratingModal.style.display = 'flex';
        // Re-render to ensure current ratings are displayed
        const currentUser = auth.currentUser;
        if (currentUser) {
            updateProfileDropdown(currentUser);
        }
    }
}

function hideRatingModal() {
    const ratingModal = document.getElementById('rating-modal');
    if (ratingModal) {
        ratingModal.style.display = 'none';
    }
}

// Function for testing/debugging to manually add a rating
async function addRatingToUser(email, rating, role = 'questmaster') {
    try {
        if (rating < 1 || rating > 5) {
            console.error('Rating must be between 1 and 5');
            return;
        }

        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const userDocRef = doc(db, 'users', snapshot.docs[0].id);
            const userDoc = snapshot.docs[0].data();
            
            const ratingField = role === 'questmaster' ? 'questmasterRatings' : 'voyagerRatings';
            const updatedRatings = [...(userDoc[ratingField] || []), rating];
            
            await updateDoc(userDocRef, { [ratingField]: updatedRatings });
            
            // Also update localStorage
            const userData = getUserDataFromStorage(email);
            userData[ratingField] = updatedRatings;
            saveUserDataToStorage(email, userData);
            
            console.log(`Successfully added ${rating} star rating to ${email} as ${role}.`);
            // Trigger UI update if the user is the current user
            if (auth.currentUser && auth.currentUser.email === email) {
                updateProfileDropdown(auth.currentUser);
                showSuccessMessage(`New ${role} rating added!`);
            }
        } else {
            console.error('User not found in Firestore.');
        }
    } catch (error) {
        console.error('Error adding rating:', error);
    }
}

// Example usage for debugging in console: testRating('user@example.com', 4.5, 'voyager')
function testRating(email, rating, role) {
    if (!email || !rating || !role) {
        console.error('Usage: testRating(email, rating, role). Role must be "questmaster" or "voyager"');
        return;
    }
    addRatingToUser(email, rating, role);
}

// Function to handle the opening/closing of the notification panel
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

// Function to handle the opening/closing of the profile dropdown
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Function to handle the opening/closing of the main nav submenu
function togglePostTaskSubmenu(event) {
    event.preventDefault();
    const submenu = document.getElementById('post-task-submenu');
    if (submenu) {
        submenu.classList.toggle('show');
    }
}

// Function to show the task creation form
function showNewTaskForm() {
    const taskFormContainer = document.getElementById('newTaskFormContainer');
    const mainContent = document.getElementById('main-content');
    if (taskFormContainer && mainContent) {
        taskFormContainer.style.display = 'block';
        mainContent.classList.add('form-visible');
    }
    // Close the submenu after selection
    const submenu = document.getElementById('post-task-submenu');
    if (submenu) submenu.classList.remove('show');
}

// Function to hide the task creation form
function hideNewTaskForm() {
    const taskFormContainer = document.getElementById('newTaskFormContainer');
    const mainContent = document.getElementById('main-content');
    if (taskFormContainer && mainContent) {
        taskFormContainer.style.display = 'none';
        mainContent.classList.remove('form-visible');
        document.getElementById('task-form').reset(); // Clear the form
    }
}

// Debounced function for character counting
const updateCharacterCount = debounce(function(inputId, counterElement) {
    const input = document.getElementById(inputId);
    if (input) {
        const currentLength = input.value.length;
        const maxLength = parseInt(input.maxLength);
        counterElement.textContent = `${currentLength}/${maxLength}`;
        if (currentLength >= maxLength) {
            counterElement.style.color = 'var(--color-accent-red)';
        } else {
            counterElement.style.color = 'var(--color-text-medium)';
        }
    }
}, 50);

function setupCharacterCounters() {
    const counters = document.querySelectorAll('.char-count');
    counters.forEach(counter => {
        const inputId = counter.dataset.for;
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', () => updateCharacterCount(inputId, counter));
            // Initialize count
            updateCharacterCount(inputId, counter);
        }
    });
}

// Helper for manually creating a test notification
function createTestNotification() {
    const testEmail = auth.currentUser ? auth.currentUser.email : 'test@iitj.ac.in';
    sendNotification(testEmail, 'This is a test notification from the system.', 'test-task-id-123', 'test-applicant@iitj.ac.in');
}


// Event Listeners setup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Toggles
    const signinToggle = document.getElementById('signin-toggle');
    const signupToggle = document.getElementById('signup-toggle');
    if (signinToggle) signinToggle.addEventListener('click', showSignInForm);
    if (signupToggle) signupToggle.addEventListener('click', showSignUpForm);

    // Auth Actions
    const signinBtn = document.getElementById('signin-btn');
    const signupBtn = document.getElementById('signup-btn');
    const signoutBtn = document.getElementById('signout-btn');
    if (signinBtn) signinBtn.addEventListener('click', handleLogIn);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (signoutBtn) signoutBtn.addEventListener('click', handleLogOut);
    
    // Task Posting
    const taskForm = document.getElementById('task-form');
    const postTaskSubmitBtn = document.getElementById('post-task-submit-btn');
    const newTaskItem = document.getElementById('new-task-item');
    const postTaskBtn = document.getElementById('post-task-btn');
    const cancelTaskBtn = document.getElementById('cancel-task-btn');

    if (taskForm) taskForm.addEventListener('submit', handleFormSubmit);
    if (newTaskItem) newTaskItem.addEventListener('click', (e) => { e.preventDefault(); showNewTaskForm(); });
    if (postTaskBtn) postTaskBtn.addEventListener('click', togglePostTaskSubmenu);
    if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', hideNewTaskForm);
    
    // Notification Panel
    const bellIcon = document.getElementById('notification-bell');
    if (bellIcon) {
        bellIcon.addEventListener('click', toggleNotificationPanel);
    }
    
    // Profile Dropdown
    const profileIcon = document.getElementById('profile-icon');
    const profileDropdown = document.getElementById('profile-dropdown');
    if (profileIcon) {
        profileIcon.addEventListener('click', toggleProfileDropdown);
        
        // Close profile dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileContainer.contains(e.target) && profileDropdown.classList.contains('show')) {
                profileDropdown.classList.remove('show');
            }
        });
        
        // Save profile changes button
        const profileSave = document.getElementById('profile-save');
        if (profileSave) {
            profileSave.addEventListener('click', function() {
                handleSaveProfileChanges();
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
