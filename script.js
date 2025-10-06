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

// Add event listeners for task form visibility
// Function to display task history
async function displayTaskHistory() {
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in');
        return;
    }

    const taskListContainer = document.querySelector('.task-list-container');
    const taskHistoryContainer = document.getElementById('taskHistoryContainer');
    const questmasterHistory = document.getElementById('questmasterHistory');
    const voyagerHistory = document.getElementById('voyagerHistory');

    if (!taskHistoryContainer || !questmasterHistory || !voyagerHistory) {
        console.error('Required elements not found');
        return;
    }

    // Hide task list and show history
    taskListContainer.style.display = 'none';
    taskHistoryContainer.style.display = 'block';

    // Clear previous content
    questmasterHistory.innerHTML = '<div class="loading">Loading...</div>';
    voyagerHistory.innerHTML = '<div class="loading">Loading...</div>';

    try {
        // Set up realtime listener for tasks created by the user (Questmaster)
        const questmasterQuery = query(
            collection(db, 'tasks'),
            where('creator', '==', user.email),
            orderBy('createdAt', 'desc')
        );

        // Set up realtime listener for tasks assigned to the user (Voyager)
        const voyagerQuery = query(
            collection(db, 'tasks'),
            where('assignedTo', '==', user.email),
            orderBy('createdAt', 'desc')
        );

        // Set up realtime listeners
        const unsubscribeQuestmaster = onSnapshot(questmasterQuery, (snapshot) => {
            questmasterHistory.innerHTML = '';
            if (snapshot.empty) {
                questmasterHistory.innerHTML = '<div class="no-tasks">No quests posted yet</div>';
            } else {
                snapshot.forEach(doc => {
                    const task = { id: doc.id, ...doc.data() };
                    const card = createHistoryCard(task, 'questmaster');
                    questmasterHistory.appendChild(card);
                });
            }
        });

        const unsubscribeVoyager = onSnapshot(voyagerQuery, (snapshot) => {
            voyagerHistory.innerHTML = '';
            if (snapshot.empty) {
                voyagerHistory.innerHTML = '<div class="no-tasks">No quests assigned yet</div>';
            } else {
                snapshot.forEach(doc => {
                    const task = { id: doc.id, ...doc.data() };
                    const card = createHistoryCard(task, 'voyager');
                    voyagerHistory.appendChild(card);
                });
            }
        });

        // Clean up listeners when navigating away
        return () => {
            unsubscribeQuestmaster();
            unsubscribeVoyager();
        };
    } catch (error) {
        console.error('Error fetching task history:', error);
        questmasterHistory.innerHTML = '<div class="error">Failed to load history</div>';
        voyagerHistory.innerHTML = '<div class="error">Failed to load history</div>';
    }
}

// Helper function to create task history cards
function createHistoryCard(task, type) {
    const card = document.createElement('div');
    card.className = 'task-history-card';
    
    const isLateSubmission = task.completedAt && task.dueDate && 
        new Date(task.completedAt.seconds * 1000) > new Date(task.dueDate.seconds * 1000);
    
    let status = task.status;
    if (task.status === 'completed' && isLateSubmission) {
        status = 'Submitted Late';
    } else if (task.status === 'completed') {
        status = 'Completed';
    } else {
        status = 'In Progress';
    }
    
    const statusClass = task.status === 'completed' ? 
        (isLateSubmission ? 'late' : 'completed') : 'in-progress';
    
    const date = task.createdAt ? new Date(task.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown';
    const dueDate = task.dueDate ? new Date(task.dueDate.seconds * 1000).toLocaleDateString() : 'No due date';
    
    const canEdit = type === 'questmaster' && 
        task.status !== 'completed' && 
        (!task.dueDate || new Date() < new Date(task.dueDate.seconds * 1000));
        
    const canComplete = type === 'voyager' && 
        task.status !== 'completed' && 
        task.assignedTo === auth.currentUser.email;
    
    card.innerHTML = `
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.description)}</p>
        <div class="task-meta">
            <span class="reward">₹${task.reward}</span>
            ${task.venue ? `<span class="venue">📍 ${escapeHtml(task.venue)}</span>` : ''}
            <span class="date">Posted: ${date}</span>
            <span class="date">Due: ${dueDate}</span>
            <span class="status ${statusClass}">${status}</span>
            ${type === 'questmaster' 
                ? `<span class="assignee">Assigned to: ${task.assignedTo || 'Not assigned'}</span>`
                : `<span class="creator">Posted by: ${task.creator}</span>`}
        </div>
        <div class="task-actions">
            ${canEdit ? `
                <button class="edit-btn" data-task-id="${task.id}">Edit</button>
                <button class="delete-btn" data-task-id="${task.id}">Delete</button>
            ` : ''}
            ${canComplete ? `
                <button class="complete-btn" data-task-id="${task.id}">Mark as Complete</button>
            ` : ''}
        </div>
    `;

    // Add event listeners for the buttons
    if (canEdit) {
        const editBtn = card.querySelector('.edit-btn');
        const deleteBtn = card.querySelector('.delete-btn');

        editBtn.addEventListener('click', () => handleEditTask(task));
        deleteBtn.addEventListener('click', () => handleDeleteTask(task));
    }

    if (canComplete) {
        const completeBtn = card.querySelector('.complete-btn');
        completeBtn.addEventListener('click', () => handleCompleteTask(task));
    }
    
    return card;
}

// Handle dropdown visibility
function handleDropdown(show = false) {
    const submenu = document.getElementById('post-task-submenu');
    if (submenu) {
        if (show) {
            submenu.classList.add('active');
        } else {
            submenu.classList.remove('active');
        }
    }
}

// Toggle form visibility with overlay
function toggleTaskForm(show = false) {
    const taskFormContainer = document.getElementById('newTaskFormContainer');
    const taskListContainer = document.querySelector('.task-list-container');
    const modalOverlay = document.getElementById('modalOverlay');
    
    if (!taskFormContainer || !taskListContainer || !modalOverlay) {
        console.error('Required elements not found');
        return;
    }

    if (show) {
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        modalOverlay.classList.add('active');
        taskFormContainer.classList.add('active');
        taskListContainer.classList.add('fade');
    } else {
        document.body.style.overflow = ''; // Restore scrolling
        modalOverlay.classList.remove('active');
        taskFormContainer.classList.remove('active');
        taskListContainer.classList.remove('fade');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const postTaskBtn = document.getElementById('post-task-btn');
    const cancelTaskBtn = document.getElementById('cancel-task-btn');
    const newTaskItem = document.getElementById('new-task-item');
    const taskHistoryItem = document.getElementById('task-history-item');

    // Handle post task button click
    if (postTaskBtn) {
        let isDropdownVisible = false;
        
        postTaskBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isDropdownVisible = !isDropdownVisible;
            handleDropdown(isDropdownVisible);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-item') && isDropdownVisible) {
                isDropdownVisible = false;
                handleDropdown(false);
            }
        });
    }

    // Handle new task item click
    if (newTaskItem) {
        newTaskItem.addEventListener('click', (e) => {
            e.preventDefault();
            handleDropdown(false);
            toggleTaskForm(true);
        });
    }

    // Handle cancel button
    if (cancelTaskBtn) {
        cancelTaskBtn.addEventListener('click', () => {
            toggleTaskForm(false);
        });
    }

    // Add task history click handler
    if (taskHistoryItem) {
        taskHistoryItem.addEventListener('click', (e) => {
            e.preventDefault();
            handleDropdown(false);
            displayTaskHistory();
        });
    }

    // Update the form submission handling
    const existingTaskForm = document.getElementById('task-form');
    if (existingTaskForm) {
        const originalSubmit = existingTaskForm.onsubmit;
        existingTaskForm.onsubmit = async (e) => {
            e.preventDefault();
            if (originalSubmit) {
                await originalSubmit.call(existingTaskForm, e);
            }
            toggleTaskForm(false);
        };
    }
    
    if (postTaskBtn) {
        postTaskBtn.addEventListener('click', () => {
            if (taskFormContainer && taskListContainer) {
                taskFormContainer.classList.add('active');
                taskListContainer.classList.add('fade');
            }
        });
    }
    
    if (cancelTaskBtn) {
        cancelTaskBtn.addEventListener('click', () => {
            if (taskFormContainer && taskListContainer) {
                taskFormContainer.classList.remove('active');
                taskListContainer.classList.remove('fade');
            }
        });
    }

    // Also handle form submission completion
    const taskForm = document.getElementById('task-form');
    if (taskForm) {
        const originalSubmit = taskForm.onsubmit;
        taskForm.onsubmit = async (e) => {
            if (originalSubmit) {
                await originalSubmit(e);
            }
            if (taskFormContainer && taskListContainer) {
                taskFormContainer.classList.remove('active');
                taskListContainer.classList.remove('fade');
            }
        };
    }
});

// Debounce function for performance
// Handler for editing a task
async function handleEditTask(task) {
    // Populate the task form with existing data
    const taskForm = document.getElementById('task-form');
    const titleInput = document.getElementById('task-title');
    const descInput = document.getElementById('task-description');
    const rewardInput = document.getElementById('task-reward');
    const dueDateInput = document.getElementById('task-due-date');
    const venueInput = document.getElementById('task-venue');

    if (taskForm && titleInput && descInput && rewardInput && dueDateInput && venueInput) {
        titleInput.value = task.title;
        descInput.value = task.description;
        rewardInput.value = task.reward;
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate.seconds * 1000);
            dueDateInput.value = dueDate.toISOString().split('T')[0];
        }
        venueInput.value = task.venue || '';

        // Show the form
        toggleTaskForm(true);

        // Update the form submission handler
        taskForm.onsubmit = async (e) => {
            e.preventDefault();
            try {
                await updateDoc(doc(db, 'tasks', task.id), {
                    title: titleInput.value,
                    description: descInput.value,
                    reward: rewardInput.value,
                    dueDate: dueDateInput.value ? new Date(dueDateInput.value) : null,
                    venue: venueInput.value,
                    updatedAt: serverTimestamp()
                });
                toggleTaskForm(false);
            } catch (error) {
                console.error('Error updating task:', error);
                alert('Failed to update quest. Please try again.');
            }
        };
    }
}

// Handler for deleting a task
async function handleDeleteTask(task) {
    if (!confirm('Are you sure you want to delete this quest?')) return;

    try {
        await deleteDoc(doc(db, 'tasks', task.id));
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete quest. Please try again.');
    }
}

// Handler for completing a task
async function handleCompleteTask(task) {
    try {
        await updateDoc(doc(db, 'tasks', task.id), {
            status: 'completed',
            completedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error completing task:', error);
        alert('Failed to mark quest as complete. Please try again.');
    }
}

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
                        <span class="venue"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(task.venue || 'Venue TBD')}</span>
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
        // Get venue
        const venue = document.getElementById('venue').value.trim();
        if (!venue) {
            showErrorMessage('Please specify a venue');
            return;
        }

        // Create quest object
        const taskData = {
            title: taskTitle,
            description: description,
            venue: venue,
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
            const questmasterRatings = userData.questmasterRatings || [];
            const voyagerRatings = userData.voyagerRatings || [];
            
            const questmasterAverage = questmasterRatings.length > 0 
                ? questmasterRatings.reduce((sum, rating) => sum + rating, 0) / questmasterRatings.length 
                : 0;
            const voyagerAverage = voyagerRatings.length > 0 
                ? voyagerRatings.reduce((sum, rating) => sum + rating, 0) / voyagerRatings.length 
                : 0;
            
            renderStarRating(questmasterAverage, 'questmaster-rating');
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
            
            const ratingsArray = ratingType === 'questmaster' ? 'questmasterRatings' : 'voyagerRatings';
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

function handleSaveProfileChanges() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showErrorMessage('No user logged in');
            return;
        }
        
        const usernameInput = document.getElementById('profile-username-input');
        if (!usernameInput) {
            showErrorMessage('Username input not found');
            return;
        }
        
        const newUsername = usernameInput.value.trim();
        if (!newUsername) {
            showErrorMessage('Username cannot be empty');
            return;
        }
        
        if (newUsername.length < 3) {
            showErrorMessage('Username must be at least 3 characters long');
            return;
        }
        
        // Get current user data
        const userData = getUserDataFromStorage(currentUser.email);
        
        // Update username
        userData.username = newUsername;
        
        // Save to localStorage
        const success = saveUserDataToStorage(currentUser.email, userData);
        
        if (success) {
            // Update welcome message
            document.getElementById('current-user').textContent = newUsername;
            showSuccessMessage('Username updated successfully!');
        } else {
            showErrorMessage('Failed to save username');
        }
        
    } catch (error) {
        console.error('Error saving profile changes:', error);
        showErrorMessage('An error occurred while saving changes');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Hide the task form container on page load
    const taskFormContainer = document.getElementById('newTaskFormContainer');
    if (taskFormContainer) {
        taskFormContainer.style.display = 'none';
    }
    
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);
    
    // Cancel task button functionality
    const cancelTaskBtn = document.getElementById('cancel-task-btn');
    if (cancelTaskBtn) {
        cancelTaskBtn.addEventListener('click', function() {
            const taskFormContainer = document.getElementById('newTaskFormContainer');
            const mainContent = document.getElementById('main-content');
            if (taskFormContainer && mainContent) {
                taskFormContainer.style.display = 'none';
                mainContent.classList.remove('form-visible'); // Remove class for layout adjustment
                // Reset the form when canceling
                document.getElementById('task-form').reset();
            }
        });
    }
    
    // Set minimum date for deadline date input (today)
    const deadlineDateInput = document.getElementById('deadline-date');
    if (deadlineDateInput) {
        const today = new Date().toISOString().split('T')[0];
        deadlineDateInput.min = today;
    }
    
    document.getElementById('signin-btn').addEventListener('click', handleLogIn);
    
    // Add Enter key functionality to sign-in form
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
        signinForm.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                event.preventDefault(); // Prevent form submission
                handleLogIn(); // Trigger sign-in
            }
        });
    }
    
    document.getElementById('signup-btn').addEventListener('click', handleSignUp);
    
    // Add Enter key functionality to sign-up form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                event.preventDefault(); // Prevent form submission
                handleSignUp(); // Trigger sign-up
            }
        });
    }
    document.getElementById('signout-btn').addEventListener('click', handleLogOut);
    
    // Navigation dropdown functionality
    const postTaskBtn = document.getElementById('post-task-btn');
    const postTaskSubmenu = document.getElementById('post-task-submenu');
    const navItem = document.querySelector('.nav-item');
    
    if (postTaskBtn && postTaskSubmenu && navItem) {
        postTaskBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            postTaskSubmenu.classList.toggle('show');
            navItem.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!postTaskBtn.contains(e.target) && !postTaskSubmenu.contains(e.target)) {
                postTaskSubmenu.classList.remove('show');
                navItem.classList.remove('active');
            }
        });
        
        // Handle submenu item clicks
        const submenuItems = postTaskSubmenu.querySelectorAll('.submenu-item');
        submenuItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const itemId = this.id;
                
                // Handle different submenu actions
                switch(itemId) {
                    case 'new-task-item':
                        // Show the task creation form
                        const taskFormContainer = document.getElementById('newTaskFormContainer');
                        const mainContent = document.getElementById('main-content');
                        if (taskFormContainer && mainContent) {
                            console.log("Button clicked, attempting to show form");
                            taskFormContainer.style.display = 'block';
                            mainContent.classList.add('form-visible'); // Add class for layout adjustment
                            // Scroll to the form for better UX
                            taskFormContainer.scrollIntoView({ behavior: 'smooth' });
                        }
                        break;
                    case 'task-templates-item':
                        showSuccessMessage('Task Templates feature coming soon!');
                        break;
                    case 'my-tasks-item':
                        showSuccessMessage('My Tasks feature coming soon!');
                        break;
                    case 'task-history-item':
                        showSuccessMessage('Task History feature coming soon!');
                        break;
                    case 'view-drafts-item':
                        showSuccessMessage('View Drafts feature coming soon!');
                        break;
                }
                
                // Close dropdown after action
                postTaskSubmenu.classList.remove('show');
                navItem.classList.remove('active');
            });
        });
    }
    
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
        
        // Save changes functionality
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