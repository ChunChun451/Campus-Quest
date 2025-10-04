// Import Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { 
    getFirestore,
    collection, 
    doc, 
    getDocs, 
    getDoc,
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query,
    where,
    orderBy, 
    onSnapshot,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAILEPqpSE8c-Qr_7rSZvZkwRNCL-CwtAI",
    authDomain: "campus-quest-3e381.firebaseapp.com",
    projectId: "campus-quest-3e381",
    storageBucket: "campus-quest-3e381.firebasestorage.app",
    messagingSenderId: "498855301825",
    appId: "1:498855301825:web:11df6a5382cc53c4fe7a40",
    measurementId: "G-8ZK4N4SN4H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// --- FIX #1: RELIABLE AUTH STATE MANAGEMENT ---
// This is the official way to track if a user is logged in or not.
// It automatically updates whenever the user signs in or out.
onAuthStateChanged(auth, user => {
    if (user && user.emailVerified) {
        // User is signed in and verified
        console.log("User is logged in:", user);
        updateAuthUI(user);
        displayTasks();
        displayNotifications();
    } else {
        // User is signed out or not verified
        console.log("User is logged out.");
        updateAuthUI(null);
        const taskListContainer = document.querySelector('.task-list');
        if (taskListContainer) {
            taskListContainer.innerHTML = ''; // Clear tasks when logged out
        }
    }
});


async function displayTasks() {
    const taskListContainer = document.querySelector('.task-list');
    
    if (!db) return;
    
    try {
        taskListContainer.innerHTML = '';
        const tasksSnapshot = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')));
        
        if (tasksSnapshot.empty) {
            taskListContainer.innerHTML = '<div class="no-tasks">No tasks available yet.</div>';
            return;
        }
        
        tasksSnapshot.forEach(doc => {
            const task = { id: doc.id, ...doc.data() };
            const taskCard = document.createElement('div');
            taskCard.className = 'task-card';
            taskCard.innerHTML = `
                <h3>${task.title}</h3>
                <p>${task.description}</p>
                <div class="task-meta">
                    <span class="reward">${task.reward}</span>
                    <span class="creator">Posted by: ${task.creator}</span>
                </div>
                <button class="apply-btn" data-task-id="${task.id}">Apply</button>
            `;
            taskListContainer.appendChild(taskCard);
            taskCard.querySelector('.apply-btn').addEventListener('click', handleApplyClick);
        });
    } catch (error) {
        console.error('Error displaying tasks:', error);
        taskListContainer.innerHTML = '<div class="error">Error loading tasks.</div>';
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const currentUser = auth.currentUser; // Get the currently logged-in user

    if (!currentUser) {
        alert('Please sign in to post a task');
        return;
    }
    
    const taskTitle = document.getElementById('task-title').value;
    const description = document.getElementById('description').value;
    const reward = document.getElementById('reward').value;
    
    if (!taskTitle || !description || !reward) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        const newTask = {
            title: taskTitle,
            description: description,
            reward: reward,
            creator: currentUser.email, // Use user's email
            applicants: [],
            createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'tasks'), newTask);
        
        document.querySelector('form').reset(); // Reset the form
        showSuccessMessage('Task Posted!');
        // displayTasks will be called automatically by the listener if needed, but we can call it for instant feedback
        await displayTasks();
    } catch (error) {
        console.error('Error posting task:', error);
        alert('Error posting task. Please try again.');
    }
}

function showSuccessMessage(message) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.textContent = message;
    document.body.appendChild(successMessage);
    setTimeout(() => successMessage.classList.add('show'), 100);
    setTimeout(() => {
        successMessage.classList.remove('show');
        setTimeout(() => document.body.removeChild(successMessage), 300);
    }, 3000);
}

async function handleApplyClick(event) {
    const taskId = event.target.getAttribute('data-task-id');
    const currentUser = auth.currentUser;

    if (!currentUser) {
        alert('Please sign in to apply for tasks');
        return;
    }
    
    try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (!taskDoc.exists()) {
            alert('Task not found');
            return;
        }
        
        const task = taskDoc.data();
        
        if (task.creator === currentUser.email) {
            alert('You cannot apply to your own task!');
            return;
        }
        
        if (task.applicants && task.applicants.includes(currentUser.email)) {
            alert('You have already applied to this task!');
            return;
        }
        
        const updatedApplicants = [...(task.applicants || []), currentUser.email];
        await updateDoc(taskRef, { applicants: updatedApplicants });
        
        await sendNotification(task.creator, `${currentUser.email} has applied to your task: "${task.title}"`);
        
        alert('Your application has been sent!');
    } catch (error) {
        console.error('Error applying to task:', error);
        alert('Error applying to task. Please try again.');
    }
}

// --- CORRECT, SECURE FIREBASE AUTH FUNCTIONS ---

async function handleSignUp() {
    console.log('handleSignUp called');
    
    const email = document.getElementById('new-email').value.trim();
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    console.log('Form data:', { email, password: password ? '***' : 'empty', confirmPassword: confirmPassword ? '***' : 'empty' });
    
    if (!email.endsWith('@iitj.ac.in')) {
        console.log('Email validation failed');
        alert('Error: Only IITJ email accounts are allowed.');
        return;
    }
    
    console.log('Email validation passed');
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        alert('Account created! Please check your IITJ email to verify your account before logging in.');
        document.getElementById('signup-form').reset();
    } catch (error) {
        console.error('Sign up error:', error.code);
        if (error.code === 'auth/email-already-in-use') {
            alert('This email is already in use. Please log in.');
        } else {
            alert('Error creating account. Please try again.');
        }
    }
}

async function handleLogIn() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
            await signOut(auth); // Sign them out again
            alert('You must verify your email before logging in. Please check your inbox.');
        } else {
            // Login successful, onAuthStateChanged will handle the UI update.
            console.log('Login successful');
        }
    } catch (error) {
        console.error('Login error:', error.code);
        alert('Invalid email or password. Please try again.');
    }
}

async function handleLogOut() {
    try {
        await signOut(auth);
        // UI update is handled by onAuthStateChanged
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
    
    if (user) {
        // User is signed in
        signinModal.style.display = 'none';
        mainContent.style.display = 'grid';
        userInfo.style.display = 'flex';
        document.getElementById('current-user').textContent = user.email;
        document.getElementById('notification-bell').style.display = 'block';
    } else {
        // User is signed out
        signinModal.style.display = 'flex';
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        document.getElementById('notification-bell').style.display = 'none';
    }
}

// --- NOTIFICATION SYSTEM (ASSUMING IT'S MOSTLY CORRECT) ---
async function sendNotification(userEmail, message) {
    try {
        await addDoc(collection(db, 'notifications'), {
            user: userEmail,
            message: message,
            timestamp: serverTimestamp(),
            read: false
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

async function displayNotifications() {
    const currentUser = auth.currentUser;
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    
    if (!currentUser || !notificationList) return;
    
    try {
        const q = query(collection(db, 'notifications'), where("user", "==", currentUser.email), orderBy('timestamp', 'desc'));
        
        onSnapshot(q, (snapshot) => {
            notificationList.innerHTML = '';
            const userNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const unreadCount = userNotifs.filter(notif => !notif.read).length;
            notificationCount.textContent = unreadCount;
            
            if (userNotifs.length === 0) {
                notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
                return;
            }
            
            userNotifs.forEach(notif => {
                const notifElement = document.createElement('div');
                notifElement.className = `notification-item ${notif.read ? 'read' : 'unread'}`;
                const timestamp = notif.timestamp ? new Date(notif.timestamp.seconds * 1000).toLocaleString() : 'Just now';
                notifElement.innerHTML = `<p>${notif.message}</p><small>${timestamp}</small>`;
                notifElement.addEventListener('click', () => markNotificationAsRead(notif.id));
                notificationList.appendChild(notifElement);
            });
        });
    } catch (error) {
        console.error('Error displaying notifications:', error);
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

function showNotificationPanel() {
    document.getElementById('notification-panel').classList.add('show');
    document.getElementById('notification-overlay').classList.add('show');
}

function hideNotificationPanel() {
    document.getElementById('notification-panel').classList.remove('show');
    document.getElementById('notification-overlay').classList.remove('show');
}


// Add event listeners when the page content is loaded
document.addEventListener('DOMContentLoaded', function() {
    
    document.querySelector('form').addEventListener('submit', handleFormSubmit);
    
    // Auth buttons
    document.getElementById('signin-btn').addEventListener('click', handleLogIn);
    document.getElementById('signup-btn').addEventListener('click', handleSignUp);
    document.getElementById('signout-btn').addEventListener('click', handleLogOut);
    
    // Form toggles
    document.getElementById('signin-toggle').addEventListener('click', showSignInForm);
    document.getElementById('signup-toggle').addEventListener('click', showSignUpForm);

    // Enter key support for auth forms
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleLogIn();
    });
    
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleLogIn();
    });
    
    document.getElementById('new-email').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSignUp();
    });
    
    document.getElementById('new-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSignUp();
    });
    
    document.getElementById('confirm-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSignUp();
    });

    // Notifications
    document.getElementById('bell-icon').addEventListener('click', showNotificationPanel);
    document.getElementById('notification-overlay').addEventListener('click', hideNotificationPanel);
    document.getElementById('close-notifications').addEventListener('click', hideNotificationPanel);

    // Initial UI state
    updateAuthUI(auth.currentUser);
});