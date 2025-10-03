// Import Firestore functions
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    onSnapshot,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// User authentication system
let currentUser = null;
let db = null;

// Initialize database reference
function initDatabase() {
    db = window.db;
    if (!db) {
        console.error('Firebase not initialized');
        return;
    }
    
    // Initialize with sample data if collections are empty
    initializeSampleData();
}

// Initialize sample data
async function initializeSampleData() {
    try {
        // Check if users collection exists and has data
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (usersSnapshot.empty) {
            // Add sample users
            const sampleUsers = [
                { username: 'alice', password: 'password123' },
                { username: 'bob', password: 'bobpass' },
                { username: 'charlie', password: 'charlie123' }
            ];
            
            for (const user of sampleUsers) {
                await addDoc(collection(db, 'users'), user);
            }
        }
        
        // Check if tasks collection exists and has data
        const tasksSnapshot = await getDocs(collection(db, 'tasks'));
        if (tasksSnapshot.empty) {
            // Add sample tasks
            const sampleTasks = [
                {
                    title: "Help with Math Assignment",
                    description: "I need someone to help me solve a few calculus problems.",
                    reward: "$15",
                    creator: "alice",
                    applicants: [],
                    createdAt: serverTimestamp()
                },
                {
                    title: "Grocery Run",
                    description: "Pick up milk, eggs, and bread from the nearby store.",
                    reward: "Free Coffee",
                    creator: "alice",
                    applicants: [],
                    createdAt: serverTimestamp()
                },
                {
                    title: "Coding Help Needed",
                    description: "Looking for help with JavaScript debugging.",
                    reward: "$20",
                    creator: "bob",
                    applicants: [],
                    createdAt: serverTimestamp()
                },
                {
                    title: "Study Group",
                    description: "Need study partners for chemistry exam.",
                    reward: "Pizza and drinks",
                    creator: "charlie",
                    applicants: [],
                    createdAt: serverTimestamp()
                }
            ];
            
            for (const task of sampleTasks) {
                await addDoc(collection(db, 'tasks'), task);
            }
        }
    } catch (error) {
        console.error('Error initializing sample data:', error);
    }
}

async function displayTasks() {
    const taskListContainer = document.querySelector('.task-list');
    
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        // Clear existing tasks
        taskListContainer.innerHTML = '';
        
        // Get tasks from Firestore
        const tasksSnapshot = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')));
        
        if (tasksSnapshot.empty) {
            taskListContainer.innerHTML = '<div class="no-tasks">No tasks available yet. Create your first task!</div>';
            return;
        }
        
        // Display each task
        tasksSnapshot.forEach(doc => {
            const task = { id: doc.id, ...doc.data() };
            
            // Create card element
            const taskCard = document.createElement('div');
            taskCard.className = 'task-card';
            
            // Create HTML structure for the card
            taskCard.innerHTML = `
                <h3>${task.title}</h3>
                <p>${task.description}</p>
                <div class="task-meta">
                    <span class="reward">${task.reward}</span>
                    <span class="creator">Posted by: ${task.creator}</span>
                </div>
                <button class="apply-btn" data-task-id="${task.id}">Apply</button>
            `;
            
            // Add card to task list container
            taskListContainer.appendChild(taskCard);
            
            // Add event listener to the Apply button
            const applyBtn = taskCard.querySelector('.apply-btn');
            applyBtn.addEventListener('click', handleApplyClick);
        });
    } catch (error) {
        console.error('Error displaying tasks:', error);
        taskListContainer.innerHTML = '<div class="error">Error loading tasks. Please try again.</div>';
    }
}

// Function to handle form submission
async function handleFormSubmit(event) {
    // Prevent the form from reloading the page
    event.preventDefault();
    
    if (!currentUser) {
        alert('Please sign in to post a task');
        return;
    }
    
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    // Get the values from the input fields
    const taskTitle = document.getElementById('task-title').value;
    const description = document.getElementById('description').value;
    const reward = document.getElementById('reward').value;
    
    if (!taskTitle || !description || !reward) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        // Create a new task object
        const newTask = {
            title: taskTitle,
            description: description,
            reward: reward,
            creator: currentUser,
            applicants: [],
            createdAt: serverTimestamp()
        };
        
        // Add task to Firestore
        await addDoc(collection(db, 'tasks'), newTask);
        
        // Clear the input fields
        document.getElementById('task-title').value = '';
        document.getElementById('description').value = '';
        document.getElementById('reward').value = '';
        
        // Call the displayTasks function again to update the list on the screen with the new task
        await displayTasks();
        
        // Show success message
        showSuccessMessage('Task Posted!');
    } catch (error) {
        console.error('Error posting task:', error);
        alert('Error posting task. Please try again.');
    }
}

// Function to show temporary success message
function showSuccessMessage(message) {
    // Create success message element
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.textContent = message;
    
    // Add to the page
    document.body.appendChild(successMessage);
    
    // Show the message with animation
    setTimeout(() => {
        successMessage.classList.add('show');
    }, 100);
    
    // Remove the message after 3 seconds
    setTimeout(() => {
        successMessage.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(successMessage);
        }, 300);
    }, 3000);
}

// Function to handle Apply button clicks
async function handleApplyClick(event) {
    const taskId = event.target.getAttribute('data-task-id');
    
    if (!currentUser) {
        alert('Please sign in to apply for tasks');
        return;
    }
    
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        // Get task from Firestore
        const taskDoc = await getDoc(doc(db, 'tasks', taskId));
        
        if (!taskDoc.exists()) {
            alert('Task not found');
            return;
        }
        
        const task = taskDoc.data();
        
        // Don't allow users to apply to their own tasks
        if (task.creator === currentUser) {
            alert('You cannot apply to your own task!');
            return;
        }
        
        // Check if user has already applied
        if (task.applicants && task.applicants.includes(currentUser)) {
            alert('You have already applied to this task!');
            return;
        }
        
        // Add applicant to task
        const updatedApplicants = [...(task.applicants || []), currentUser];
        await updateDoc(doc(db, 'tasks', taskId), {
            applicants: updatedApplicants
        });
        
        // Send notification to task creator
        await sendNotification(task.creator, `${currentUser} has applied to your task: "${task.title}"`);
        
        alert('Your application has been sent!');
        
        // Refresh the task display
        await displayTasks();
    } catch (error) {
        console.error('Error applying to task:', error);
        alert('Error applying to task. Please try again.');
    }
}

// Authentication functions
async function signIn() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('signin-error');
    
    // Clear previous errors
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    if (!username) {
        showSignInError('Please enter a username');
        return;
    }
    
    if (!password) {
        showSignInError('Please enter a password');
        return;
    }
    
    if (!db) {
        showSignInError('Database not initialized');
        return;
    }
    
    try {
        // Query users collection for the username
        const usersSnapshot = await getDocs(query(collection(db, 'users')));
        let userFound = false;
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.username === username) {
                if (userData.password === password) {
                    // Successful login
                    currentUser = username;
                    userFound = true;
                } else {
                    showSignInError('Incorrect password. Please try again.');
                    return;
                }
            }
        });
        
        if (!userFound) {
            showSignInError('User not found. Please check your username.');
            return;
        }
        
        // Update UI
        updateAuthUI();
        await displayTasks();
        await displayNotifications();
        
        // Clear form fields
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    } catch (error) {
        console.error('Error signing in:', error);
        showSignInError('Error signing in. Please try again.');
    }
}

function showSignInError(message) {
    const errorDiv = document.getElementById('signin-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showSignUpError(message) {
    const errorDiv = document.getElementById('signup-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

async function signUp() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorDiv = document.getElementById('signup-error');
    
    // Clear previous errors
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    if (!username) {
        showSignUpError('Please enter a username');
        return;
    }
    
    if (!password) {
        showSignUpError('Please enter a password');
        return;
    }
    
    if (!confirmPassword) {
        showSignUpError('Please confirm your password');
        return;
    }
    
    if (password !== confirmPassword) {
        showSignUpError('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showSignUpError('Password must be at least 6 characters long');
        return;
    }
    
    if (!db) {
        showSignUpError('Database not initialized');
        return;
    }
    
    try {
        // Check if user already exists
        const usersSnapshot = await getDocs(query(collection(db, 'users')));
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.username === username) {
                showSignUpError('Username already exists. Please choose a different one.');
                return;
            }
        });
        
        // Create new user
        await addDoc(collection(db, 'users'), {
            username: username,
            password: password,
            createdAt: serverTimestamp()
        });
        
        // Successful sign up - auto sign in
        currentUser = username;
        
        // Update UI
        updateAuthUI();
        await displayTasks();
        await displayNotifications();
        
        // Clear form fields
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    } catch (error) {
        console.error('Error signing up:', error);
        showSignUpError('Error creating account. Please try again.');
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
    document.getElementById('modal-subtitle').textContent = 'Create a new account to get started';
}

async function signOut() {
    currentUser = null;
    updateAuthUI();
    await displayTasks();
}

function updateAuthUI() {
    const signinModal = document.getElementById('signin-modal');
    const mainContent = document.getElementById('main-content');
    const userInfo = document.getElementById('user-info');
    const currentUserSpan = document.getElementById('current-user');
    const notificationBell = document.getElementById('notification-bell');
    
    if (currentUser) {
        // Hide sign-in modal and show main content
        signinModal.style.display = 'none';
        mainContent.style.display = 'grid';
        userInfo.style.display = 'flex';
        currentUserSpan.textContent = currentUser;
        notificationBell.style.display = 'block';
    } else {
        // Show sign-in modal and hide main content
        signinModal.style.display = 'flex';
        mainContent.style.display = 'none';
        userInfo.style.display = 'none';
        notificationBell.style.display = 'none';
    }
}

// Notification system
async function sendNotification(user, message) {
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        await addDoc(collection(db, 'notifications'), {
            user: user,
            message: message,
            timestamp: serverTimestamp(),
            read: false
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

async function displayNotifications() {
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const notificationBell = document.getElementById('notification-bell');
    
    if (!notificationList || !notificationCount || !notificationBell) return;
    
    if (!currentUser || !db) {
        notificationBell.style.display = 'none';
        return;
    }
    
    try {
        // Get notifications for current user
        const notificationsSnapshot = await getDocs(
            query(
                collection(db, 'notifications'),
                orderBy('timestamp', 'desc')
            )
        );
        
        const userNotifs = [];
        notificationsSnapshot.forEach(doc => {
            const notif = { id: doc.id, ...doc.data() };
            if (notif.user === currentUser) {
                userNotifs.push(notif);
            }
        });
        
        const unreadCount = userNotifs.filter(notif => !notif.read).length;
        
        // Update notification count
        notificationCount.textContent = unreadCount;
        
        // Always show bell icon when user is signed in
        notificationBell.style.display = 'block';
        
        // Clear and populate notification list
        notificationList.innerHTML = '';
        
        if (userNotifs.length === 0) {
            notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
            return;
        }
        
        // Show notifications in reverse order (newest first)
        userNotifs.forEach(notif => {
            const notifElement = document.createElement('div');
            notifElement.className = `notification-item ${notif.read ? 'read' : 'unread'}`;
            
            const timestamp = notif.timestamp ? 
                new Date(notif.timestamp.seconds * 1000).toLocaleString() : 
                'Just now';
            
            notifElement.innerHTML = `
                <p>${notif.message}</p>
                <small>${timestamp}</small>
            `;
            notificationList.appendChild(notifElement);
        });
    } catch (error) {
        console.error('Error displaying notifications:', error);
        notificationList.innerHTML = '<div class="error">Error loading notifications</div>';
    }
}

// Add event listener to the form
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize database
    initDatabase();
    
    const form = document.querySelector('form');
    form.addEventListener('submit', handleFormSubmit);
    
    // Add authentication event listeners
    document.getElementById('signin-btn').addEventListener('click', signIn);
    document.getElementById('signup-btn').addEventListener('click', signUp);
    document.getElementById('signout-btn').addEventListener('click', signOut);
    
    // Add toggle functionality
    document.getElementById('signin-toggle').addEventListener('click', function() {
        showSignInForm();
    });
    
    document.getElementById('signup-toggle').addEventListener('click', function() {
        showSignUpForm();
    });
    
    // Allow Enter key to sign in from both fields
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            signIn();
        }
    });
    
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            signIn();
        }
    });
    
    // Allow Enter key to sign up from all fields
    document.getElementById('new-username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            signUp();
        }
    });
    
    document.getElementById('new-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            signUp();
        }
    });
    
    document.getElementById('confirm-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            signUp();
        }
    });
    
    // Add notification bell event listeners
    document.getElementById('bell-icon').addEventListener('click', function() {
        const dropdown = document.getElementById('notification-dropdown');
        dropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const bell = document.getElementById('bell-icon');
        const dropdown = document.getElementById('notification-dropdown');
        if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    // Clear notifications button
    document.getElementById('clear-notifications').addEventListener('click', async function() {
        if (currentUser && db) {
            try {
                // Get all notifications for current user
                const notificationsSnapshot = await getDocs(
                    query(collection(db, 'notifications'))
                );
                
                // Delete each notification
                const deletePromises = [];
                notificationsSnapshot.forEach(doc => {
                    const notif = doc.data();
                    if (notif.user === currentUser) {
                        deletePromises.push(deleteDoc(doc.ref));
                    }
                });
                
                await Promise.all(deletePromises);
                await displayNotifications();
            } catch (error) {
                console.error('Error clearing notifications:', error);
            }
        }
    });
    
    // Initialize UI
    updateAuthUI();
});