// User authentication system
let currentUser = null;
let userNotifications = {};

// User database with passwords
const userDatabase = {
    'alice': {
        password: 'password123',
        notifications: []
    },
    'bob': {
        password: 'bobpass',
        notifications: []
    },
    'charlie': {
        password: 'charlie123',
        notifications: []
    }
};

// Global tasks array - all users can see these
let globalTasks = [
    {
        id: 1,
        title: "Help with Math Assignment",
        description: "I need someone to help me solve a few calculus problems.",
        reward: "$15",
        creator: "alice",
        applicants: []
    },
    {
        id: 2,
        title: "Grocery Run",
        description: "Pick up milk, eggs, and bread from the nearby store.",
        reward: "Free Coffee",
        creator: "alice",
        applicants: []
    },
    {
        id: 3,
        title: "Coding Help Needed",
        description: "Looking for help with JavaScript debugging.",
        reward: "$20",
        creator: "bob",
        applicants: []
    },
    {
        id: 4,
        title: "Study Group",
        description: "Need study partners for chemistry exam.",
        reward: "Pizza and drinks",
        creator: "charlie",
        applicants: []
    }
];

// Initialize notifications for all users
Object.keys(userDatabase).forEach(user => {
    userNotifications[user] = userDatabase[user].notifications;
});

function displayTasks() {
    const taskListContainer = document.querySelector('.task-list');
    
    // Clear existing tasks
    taskListContainer.innerHTML = '';
    
    // Show all global tasks to everyone
    globalTasks.forEach(task => {
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
}

// Function to handle form submission
function handleFormSubmit(event) {
    // Prevent the form from reloading the page
    event.preventDefault();
    
    // Get the values from the input fields
    const taskTitle = document.getElementById('task-title').value;
    const description = document.getElementById('description').value;
    const reward = document.getElementById('reward').value;
    
    // Create a new task object with these values
    const newTask = {
        title: taskTitle,
        description: description,
        reward: reward
    };
    
    // Add this new task object to global tasks
    if (currentUser) {
        const newTaskWithId = {
            id: Date.now(), // Simple ID generation
            title: taskTitle,
            description: description,
            reward: reward,
            creator: currentUser,
            applicants: []
        };
        globalTasks.push(newTaskWithId);
    }
    
    // Clear the input fields
    document.getElementById('task-title').value = '';
    document.getElementById('description').value = '';
    document.getElementById('reward').value = '';
    
    // Call the displayTasks function again to update the list on the screen with the new task
    displayTasks();
    
    // Show success message
    showSuccessMessage('Task Posted!');
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
function handleApplyClick(event) {
    const taskId = parseInt(event.target.getAttribute('data-task-id'));
    const task = globalTasks.find(t => t.id === taskId);
    
    if (!task) return;
    
    // Don't allow users to apply to their own tasks
    if (task.creator === currentUser) {
        alert('You cannot apply to your own task!');
        return;
    }
    
    // Add applicant to task
    if (!task.applicants.includes(currentUser)) {
        task.applicants.push(currentUser);
        
        // Send notification to task creator
        sendNotification(task.creator, `${currentUser} has applied to your task: "${task.title}"`);
        
        alert('Your application has been sent!');
    } else {
        alert('You have already applied to this task!');
    }
}

// Authentication functions
function signIn() {
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
    
    // Check if user exists
    if (!userDatabase[username]) {
        showSignInError('User not found. Please check your username.');
        return;
    }
    
    // Check password
    if (userDatabase[username].password !== password) {
        showSignInError('Incorrect password. Please try again.');
        return;
    }
    
    // Successful login
    currentUser = username;
    
    // Initialize user's notifications if it doesn't exist
    if (!userNotifications[currentUser]) {
        userNotifications[currentUser] = [];
    }
    
    // Update UI
    updateAuthUI();
    displayTasks();
    displayNotifications();
    
    // Clear form fields
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
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

function signUp() {
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
    
    // Check if user already exists
    if (userDatabase[username]) {
        showSignUpError('Username already exists. Please choose a different one.');
        return;
    }
    
    // Create new user
    userDatabase[username] = {
        password: password,
        notifications: []
    };
    
    // Initialize notifications for new user
    userNotifications[username] = [];
    
    // Successful sign up - auto sign in
    currentUser = username;
    
    // Update UI
    updateAuthUI();
    displayTasks();
    displayNotifications();
    
    // Clear form fields
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
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

function signOut() {
    currentUser = null;
    updateAuthUI();
    displayTasks();
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
function sendNotification(user, message) {
    if (!userNotifications[user]) {
        userNotifications[user] = [];
    }
    userNotifications[user].push({
        id: Date.now(),
        message: message,
        timestamp: new Date(),
        read: false
    });
}

function displayNotifications() {
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const notificationBell = document.getElementById('notification-bell');
    
    if (!notificationList || !notificationCount || !notificationBell) return;
    
    const userNotifs = userNotifications[currentUser] || [];
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
    userNotifs.slice().reverse().forEach(notif => {
        const notifElement = document.createElement('div');
        notifElement.className = `notification-item ${notif.read ? 'read' : 'unread'}`;
        notifElement.innerHTML = `
            <p>${notif.message}</p>
            <small>${new Date(notif.timestamp).toLocaleString()}</small>
        `;
        notificationList.appendChild(notifElement);
    });
}

// Add event listener to the form
document.addEventListener('DOMContentLoaded', function() {
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
    document.getElementById('clear-notifications').addEventListener('click', function() {
        if (currentUser && userNotifications[currentUser]) {
            userNotifications[currentUser] = [];
            displayNotifications();
        }
    });
    
    // Initialize UI
    updateAuthUI();
});