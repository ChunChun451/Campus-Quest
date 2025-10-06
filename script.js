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
    onAuthStateChanged,
    updateProfile // ADDED: Required for updating Firebase Auth profile
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
            // Use Promise.all for concurrent fetching of usernames for better performance
            const usernamePromises = snapshot.docs.map(doc => getUsernameByEmail(doc.data().creator));
            const usernames = await Promise.all(usernamePromises);

            snapshot.docs.forEach((doc, index) => {
                const task = { id: doc.id, ...doc.data() };
                
                // Skip closed tasks (assigned tasks)
                if (task.status === 'closed') {
                    return; // Use return in forEach to skip to next item
                }
                
                // Assign fetched username
                const username = usernames[index];
                task.creatorDisplay = username || task.creator.split('@')[0];
                tasks.push(task);
            });
            
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


// UPDATED: handleSignUp function to save username to Firestore
async function handleSignUp() {
    const email = document.getElementById('new-email').value.trim();
    // Use the new ID from index.html
    const username = document.getElementById('signup-username').value.trim(); 
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
        
        // 1. Save user data to Firestore, including the username
        await addDoc(collection(db, 'users'), {
            email: email,
            username: username,
            questmasterRatings: [],
            voyagerRatings: [],
            createdAt: serverTimestamp()
        });
        
        // 2. Also save to localStorage for quick UI access
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
    // Assuming 'username' is the email input field ID in the signin form
    const email = document.getElementById('signin-email').value.trim(); 
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
            // Once logged in, ensure we fetch the username to local storage
            const userData = await getAndCacheUserData(email);
            if (!userData) {
                 showErrorMessage('Could not load user profile. Please try again.');
            } else {
                 showSuccessMessage('Welcome back!');
            }
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

// =========================================================
//  FIXED/ADDED: PROFILE UPDATE LOGIC (handleSaveProfileChanges)
// =========================================================

async function handleSaveProfileChanges() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showErrorMessage('You must be signed in to save profile changes.');
        return;
    }

    const saveButton = document.getElementById('profile-save');
    const usernameInput = document.getElementById('profile-username-input');
    const newUsername = usernameInput.value.trim();
    const originalText = saveButton.textContent;
    
    if (!newUsername || newUsername.length < 3) {
        showErrorMessage('Username must be at least 3 characters long.');
        return;
    }
    if (newUsername.length > 30) {
        showErrorMessage('Username cannot be more than 30 characters.');
        return;
    }

    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    try {
        // 1. Find the user's document using their email
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', currentUser.email));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            // If user document is somehow missing, create a new one (emergency fallback)
            await addDoc(collection(db, 'users'), {
                 email: currentUser.email,
                 username: newUsername,
                 questmasterRatings: [],
                 voyagerRatings: [],
                 createdAt: serverTimestamp()
            });
            showSuccessMessage('User document was missing, but a new one was created with the new username!');
        } else {
             // 2. Update Firestore document (where the username is stored)
            const userDocRef = snapshot.docs[0].ref;
            await updateDoc(userDocRef, { username: newUsername });
            showSuccessMessage('Profile updated successfully!');
        }
       

        // 3. Update Local Storage for quick UI access
        const userData = getUserDataFromStorage(currentUser.email);
        userData.username = newUsername;
        saveUserDataToStorage(currentUser.email, userData);
        
        // 4. Update the UI welcome message
        document.getElementById('current-user').textContent = newUsername;
        
    } catch (error) {
        console.error('Error saving profile changes:', error);
        showErrorMessage('Failed to save changes. Please try again.');
    } finally {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

// =========================================================
//  END: PROFILE UPDATE LOGIC
// =========================================================

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

// Fetches user data from Firestore and caches it in Local Storage
async function getAndCacheUserData(email) {
     try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            saveUserDataToStorage(email, userData);
            return userData;
        }
        // If not found in Firestore, return a default
        return { username: email.split('@')[0], email: email, questmasterRatings: [], voyagerRatings: [] };
    } catch (error) {
        console.error('Error fetching user data from Firestore:', error);
        return null;
    }
}


async function updateWelcomeMessage(user) {
    try {
        // First try to get data from local storage (fastest)
        let userData = getUserDataFromStorage(user.email);
        
        // If data is missing (e.g., first login, cache cleared), fetch from Firestore
        if (!userData || !userData.username || userData.username === user.email.split('@')[0]) {
            userData = await getAndCacheUserData(user.email);
            if (!userData) {
                // Fallback to email prefix if all else fails
                document.getElementById('current-user').textContent = user.email.split('@')[0];
                return;
            }
        }
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

// Utility: Gets user data from local storage
function getUserDataFromStorage(email) {
    try {
        const userData = localStorage.getItem(`user_${email}`);
        if (userData) {
            return JSON.parse(userData);
        }
        // Return default data if not found
        return { username: email.split('@')[0], email: email, questmasterRatings: [], voyagerRatings: [] };
    } catch (error) {
        console.error('Error reading user data from localStorage:', error);
        return { username: email.split('@')[0], email: email, questmasterRatings: [], voyagerRatings: [] };
    }
}

// Utility: Saves user data to local storage
function saveUserDataToStorage(email, userData) {
    try {
        localStorage.setItem(`user_${email}`, JSON.stringify(userData));
        return true;
    } catch (error) {
        console.error('Error saving user data to localStorage:', error);
        return false;
    }
}

// Utility: Fetches username from Firestore
async function getUsernameByEmail(email) {
    // 1. Try local storage first
    const localData = getUserDataFromStorage(email);
    if (localData && localData.username) {
        return localData.username;
    }

    // 2. Fallback to Firestore
    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const username = snapshot.docs[0].data().username;
            // Cache in local storage for future calls
            saveUserDataToStorage(email, snapshot.docs[0].data());
            return username;
        }
        // Fallback to email prefix if not found anywhere
        return email.split('@')[0];
    } catch (error) {
        console.error('Error fetching username:', error);
        return email.split('@')[0];
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
            
            // Add direct event listener to assign button if it exists
            const assignBtn = notifElement.querySelector('.assign-btn');
            if (assignBtn) {
                assignBtn.addEventListener('click', async (e) => {
                    console.log('Direct assign button click!'); // Debug log
                    e.preventDefault();
                    e.stopPropagation();
                    const taskId = assignBtn.dataset.taskId;
                    const applicantEmail = assignBtn.dataset.applicant;
                    const notificationId = assignBtn.dataset.notificationId;
                    console.log('Direct assign button data:', { taskId, applicantEmail, notificationId }); // Debug log
                    await assignTask(taskId, applicantEmail, notificationId);
                });
            }

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
    if (notificationCount) {
        notificationCount.textContent = '';
        notificationCount.style.display = 'none';
    }
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
            
            // Commit batch if limit reached
            if (batchCount % 499 === 0) {
                batch.commit();
                batch = writeBatch(db); // Start new batch
            }
        });
        
        // Commit final batch
        await batch.commit();

        console.log('All tasks cleared successfully');
        showSuccessMessage(`Cleared ${snapshot.docs.length} tasks.`);
        
    } catch (error) {
        console.error('Error clearing tasks:', error);
        showErrorMessage('Failed to clear tasks. Check console for details.');
    }
}

async function assignTask(taskId, applicantEmail, notificationId) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskDoc = await getDoc(taskRef);

        if (!taskDoc.exists() || taskDoc.data().status !== 'open') {
            showErrorMessage('Task no longer exists or is closed.');
            return;
        }

        const batch = writeBatch(db);

        // 1. Update task status and assigned user
        batch.update(taskRef, {
            status: 'closed',
            assignedTo: applicantEmail
        });

        // 2. Send success notification to the applicant (Voyager)
        const taskTitle = taskDoc.data().title;
        const applicantUsername = await getUsernameByEmail(applicantEmail) || applicantEmail.split('@')[0];
        
        batch.set(doc(collection(db, 'notifications')), {
            user: applicantEmail,
            message: `🎉 Congratulations ${applicantUsername}! You have been assigned the task: "${taskTitle}".`,
            timestamp: serverTimestamp(),
            read: false,
            taskId: taskId,
            type: 'assignment'
        });

        // 3. Delete the notification that triggered the assignment
        const notifRef = doc(db, 'notifications', notificationId);
        batch.delete(notifRef);
        
        // 4. Send rejection notifications to all other applicants
        const taskData = taskDoc.data();
        const rejectedApplicants = (taskData.applicants || []).filter(email => email !== applicantEmail);
        const rejectionMessage = `Your application for the task: "${taskTitle}" was not selected. The task has been assigned to another user.`;

        rejectedApplicants.forEach(rejectedEmail => {
            batch.set(doc(collection(db, 'notifications')), {
                user: rejectedEmail,
                message: rejectionMessage,
                timestamp: serverTimestamp(),
                read: false,
                taskId: taskId,
                type: 'rejection'
            });
        });

        await batch.commit();
        showSuccessMessage(`Task successfully assigned to ${applicantUsername}!`);

    } catch (error) {
        console.error('Error assigning task:', error);
        showErrorMessage('Failed to assign task. Please try again.');
    }
}

// Function to calculate and display user rating (from previous context, kept for completeness)
async function updateRatingDisplay(email, ratingType) {
    const ratingElementId = ratingType === 'questmaster' ? 'questmaster-rating' : 'voyager-rating';
    const ratingTextId = ratingType === 'questmaster' ? 'questmaster-rating-text' : 'voyager-rating-text';
    const ratingsArrayName = ratingType === 'questmaster' ? 'questmasterRatings' : 'voyagerRatings';

    const ratingElement = document.getElementById(ratingElementId);
    const ratingTextElement = document.getElementById(ratingTextId);

    if (!ratingElement || !ratingTextElement) return;

    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            ratingTextElement.textContent = 'User not found.';
            return;
        }

        const userData = snapshot.docs[0].data();
        const ratings = userData[ratingsArrayName] || [];

        if (ratings.length === 0) {
            ratingElement.querySelector('.stars').innerHTML = '<span class="star empty">☆</span><span class="star empty">☆</span><span class="star empty">☆</span><span class="star empty">☆</span><span class="star empty">☆</span>';
            ratingTextElement.textContent = 'No ratings yet';
            return;
        }

        const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
        const averageRating = totalRating / ratings.length;
        const roundedRating = Math.round(averageRating * 2) / 2; // Round to nearest 0.5

        const starsContainer = ratingElement.querySelector('.stars');
        starsContainer.innerHTML = '';

        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            star.className = 'star';
            if (roundedRating >= i) {
                star.textContent = '★'; // Full star
            } else if (roundedRating === i - 0.5) {
                star.textContent = '½'; // Half star (using a simple half character)
            } else {
                star.textContent = '☆'; // Empty star
                star.classList.add('empty');
            }
            starsContainer.appendChild(star);
        }

        ratingTextElement.textContent = `${roundedRating.toFixed(1)}/5.0 (${ratings.length} rating${ratings.length !== 1 ? 's' : ''})`;

    } catch (error) {
        console.error(`Error updating ${ratingType} rating display:`, error);
        ratingTextElement.textContent = 'Error loading rating.';
    }
}

function showRatingModal() {
    const ratingModal = document.getElementById('rating-modal');
    const currentUser = auth.currentUser;
    if (!ratingModal || !currentUser) return;

    // Update the ratings when the modal is shown
    updateRatingDisplay(currentUser.email, 'questmaster');
    updateRatingDisplay(currentUser.email, 'voyager');

    ratingModal.style.display = 'flex';
}

function hideRatingModal() {
    const ratingModal = document.getElementById('rating-modal');
    if (ratingModal) ratingModal.style.display = 'none';
}

// Function to add a rating to a user (for testing or future use)
async function addRatingToUser(email, rating, type) {
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        console.error('Rating must be an integer between 1 and 5');
        return;
    }
    const ratingsArrayName = type === 'questmaster' ? 'questmasterRatings' : 'voyagerRatings';

    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            console.error('User not found to rate.');
            return;
        }
        
        const userDocRef = snapshot.docs[0].ref;
        const userData = snapshot.docs[0].data();
        
        const currentRatings = userData[ratingsArrayName] || [];
        const updatedRatings = [...currentRatings, rating];

        await updateDoc(userDocRef, {
            [ratingsArrayName]: updatedRatings
        });

        console.log(`Successfully added a ${rating} star rating as ${type} to ${email}`);
        updateRatingDisplay(email, type); // Update display after adding rating

    } catch (error) {
        console.error(`Error adding rating as ${type}:`, error);
    }
}

// Test function (for console use)
function testRating() {
    const testEmail = 'test@iitj.ac.in'; // Replace with a real user email for testing
    addRatingToUser(testEmail, 5, 'questmaster');
    addRatingToUser(testEmail, 4, 'voyager');
}

// =========================================================
//  Event Listeners and DOM Manipulation
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Corrected Sign-in and Sign-up form IDs in JS
    const signinForm = document.getElementById('signin-form');
    const signupForm = document.getElementById('signup-form');
    const signinBtn = document.getElementById('signin-btn');
    const signupBtn = document.getElementById('signup-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const signinToggle = document.getElementById('signin-toggle');
    const signupToggle = document.getElementById('signup-toggle');
    const postTaskBtn = document.getElementById('post-task-btn'); // Corrected ID
    const taskForm = document.getElementById('task-form');
    const notificationBell = document.getElementById('notification-bell');
    const profileIcon = document.getElementById('profile-icon');
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileSave = document.getElementById('profile-save');
    const profileRating = document.getElementById('profile-rating');
    const ratingModal = document.getElementById('rating-modal');
    const ratingModalClose = document.getElementById('rating-modal-close');

    // Attach form submission handlers
    if (signinBtn) {
        signinBtn.addEventListener('click', handleLogIn);
    }
    if (signupBtn) {
        signupBtn.addEventListener('click', handleSignUp);
    }
    if (signoutBtn) {
        signoutBtn.addEventListener('click', handleLogOut);
    }
    
    // Auth toggle buttons
    if (signinToggle) {
        signinToggle.addEventListener('click', showSignInForm);
    }
    if (signupToggle) {
        signupToggle.addEventListener('click', showSignUpForm);
    }

    // Task form display toggle
    if (postTaskBtn) {
        postTaskBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTaskFormVisibility();
        });
    }
    
    // Attach listener to 'Create New Task' button in the submenu
    const newTaskItem = document.getElementById('new-task-item');
     if (newTaskItem) {
        newTaskItem.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTaskFormVisibility();
        });
    }


    // Task form submission
    if (taskForm) {
        taskForm.addEventListener('submit', handleFormSubmit);
    }

    // Notification panel toggle
    if (notificationBell) {
        notificationBell.addEventListener('click', toggleNotificationPanel);
    }

    // Profile dropdown toggle
    if (profileIcon) {
        profileIcon.addEventListener('click', function() {
            profileDropdown.classList.toggle('show');
            document.getElementById('notification-panel').classList.remove('show');
        });
    }

    // Hide profile dropdown on outside click
    document.addEventListener('click', function(e) {
        if (profileIcon && !profileIcon.contains(e.target) && profileDropdown && !profileDropdown.contains(e.target) && profileDropdown.classList.contains('show')) {
            profileDropdown.classList.remove('show');
        }
    });

    // Profile save button listener - NOW CALLS THE CORRECTLY DEFINED FUNCTION
    if (profileSave) {
        profileSave.addEventListener('click', function() {
            handleSaveProfileChanges();
            // Do NOT remove 'show' here, allow the user to see the saved state
            // profileDropdown.classList.remove('show'); 
        });
    }
    
    // Rating modal functionality
    
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
    
    setupCharacterCounters();
    
    window.createTestNotification = createTestNotification;
    window.clearAllNotifications = clearAllNotifications;
    window.clearAllTasks = clearAllTasks;
    window.togglePassword = togglePassword;
    window.addRatingToUser = addRatingToUser;
    window.testRating = testRating;
    window.clearAllAndClose = clearAllAndClose;
    window.closeNotificationPanel = closeNotificationPanel;
});


// Helper functions for UI/Toggles (from previous context, not modified)
function toggleTaskFormVisibility() {
    const taskFormContainer = document.getElementById('newTaskFormContainer');
    const mainContent = document.getElementById('main-content');
    if (taskFormContainer.style.display === 'block') {
        taskFormContainer.style.display = 'none';
        mainContent.classList.remove('form-visible');
    } else {
        taskFormContainer.style.display = 'block';
        mainContent.classList.add('form-visible');
    }
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    const profileDropdown = document.getElementById('profile-dropdown');
    panel.classList.toggle('show');
    profileDropdown.classList.remove('show'); // Close profile dropdown when opening notifications
    
    // Mark all currently displayed notifications as read when panel is opened
    const notificationList = document.getElementById('notification-list');
    const unreadItems = notificationList.querySelectorAll('.unread');
    unreadItems.forEach(item => {
        const notifId = item.querySelector('.notif-close').dataset.notificationId;
        if (notifId) {
            markNotificationAsRead(notifId);
        }
    });
}

function closeNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (panel) panel.classList.remove('show');
}

function clearAllAndClose() {
    clearAllNotifications();
    closeNotificationPanel();
}

function createTestNotification() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        console.warn('Cannot create test notification, user not logged in.');
        return;
    }
    sendNotification(currentUser.email, 'This is a test notification!');
}

function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.textContent = '🔒';
    } else {
        input.type = 'password';
        iconElement.textContent = '👁️';
    }
}

function setupCharacterCounters() {
    const titleInput = document.getElementById('task-title');
    const descriptionInput = document.getElementById('description');
    const titleCounter = document.getElementById('title-char-count');
    const descriptionCounter = document.getElementById('description-char-count');

    const updateTitleCounter = debounce(() => {
        if (titleInput && titleCounter) {
            const currentLength = titleInput.value.length;
            titleCounter.textContent = `${currentLength}/100`;
            titleCounter.style.color = currentLength > 100 ? 'var(--color-accent-red)' : 'var(--color-text-medium)';
        }
    }, 100);

    const updateDescriptionCounter = debounce(() => {
        if (descriptionInput && descriptionCounter) {
            const currentLength = descriptionInput.value.length;
            descriptionCounter.textContent = `${currentLength}/500`;
            descriptionCounter.style.color = currentLength > 500 ? 'var(--color-accent-red)' : 'var(--color-text-medium)';
        }
    }, 100);

    if (titleInput) {
        titleInput.addEventListener('input', updateTitleCounter);
    }
    if (descriptionInput) {
        descriptionInput.addEventListener('input', updateDescriptionCounter);
    }
}
