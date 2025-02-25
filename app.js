// app.js
const firebaseConfig = {
    apiKey: "AIzaSyC8G45AeX_LZ9AabsockFZCEtbHKI1yQDY",
    authDomain: "new-chat-338fd.firebaseapp.com",
    projectId: "new-chat-338fd",
    storageBucket: "new-chat-338fd.firebasestorage.app",
    messagingSenderId: "679475515999",
    appId: "1:679475515999:web:83b05f07856d2430f9c1ea",
    measurementId: "G-XMXBW7S8YW"
};

// Initialize Firebase with error handling
try {
    firebase.initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase initialization error:", error);
    alert("Error connecting to the service. Please try again later.");
}

// Cloudinary configuration
const cloudinaryConfig = {
    cloudName: 'de0ivtkcn',
    uploadPreset: 'New Chat'
};

// Initialize Cloudinary Upload Widget
const cloudinaryWidget = cloudinary.createUploadWidget(
    {
        cloudName: cloudinaryConfig.cloudName,
        uploadPreset: cloudinaryConfig.uploadPreset,
        multiple: false,
        maxFiles: 1,
        sources: ['local', 'camera', 'url'],
        resourceType: 'auto',
        maxFileSize: 10485760, // 10MB
        allowedFormats: ['jpg', 'png', 'gif', 'mp4', 'mp3', 'pdf', 'doc', 'docx']
    },
    (error, result) => {
        if (!error && result && result.event === "success") {
            handleUploadSuccess(result.info);
        }
    }
);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Global Variables
let currentUser = null;
let currentChat = null;
let currentUserStatus = null;
let messageListener = null;

// DOM Elements
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const authForm = document.getElementById('auth-form');
const toggleAuth = document.getElementById('toggle-auth');
const userList = document.getElementById('user-list');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('message-text');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const themeToggle = document.getElementById('theme-toggle');

// Add new DOM elements
const profileModal = document.getElementById('profile-modal');
const closeModal = document.getElementById('close-modal');
const profileForm = document.getElementById('profile-form');
const userProfile = document.querySelector('.user-profile');

// Add new DOM elements for profile photo
const profilePhotoInput = document.getElementById('profile-photo');
const profilePhotoPreview = document.getElementById('profile-photo-preview');
const profilePhotoContainer = document.querySelector('.profile-photo-container');

// Add clear chat button
const clearChatBtn = document.getElementById('clear-chat');

// Add forgot password link
const forgotPasswordLink = document.getElementById('forgot-password');

// Add mobile navigation handling
const sidebar = document.querySelector('.sidebar');
const backBtn = document.querySelector('.back-btn');

// Add after other DOM elements
const searchInput = document.getElementById('user-search');
let allUsers = []; // Store all users for filtering

// Add after other DOM elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const themeSelect = document.getElementById('theme-select');
const chatBgColor = document.getElementById('chat-bg-color');
const notificationSound = document.getElementById('notification-sound');
const desktopNotifications = document.getElementById('desktop-notifications');
const readReceipts = document.getElementById('read-receipts');
const onlineStatus = document.getElementById('online-status');

// Add mobile navigation handlers
function showChat() {
    if (window.innerWidth <= 768) {
        sidebar.classList.add('hidden');
    }
}

function showSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('hidden');
    }
}

// Add this function to handle image loading errors
function handleImageError(imgElement) {
    imgElement.onerror = null;  // Prevent infinite loop
    imgElement.src = DEFAULT_AVATAR;
}

// Modify image elements to use error handling
document.getElementById('user-avatar').onerror = function() { handleImageError(this); };
document.getElementById('chat-user-avatar').onerror = function() { handleImageError(this); };
document.getElementById('profile-photo-preview').onerror = function() { handleImageError(this); };

// When setting user profile image
function updateUserAvatar(imageUrl) {
    const avatarElements = [
        document.getElementById('user-avatar'),
        document.getElementById('chat-user-avatar'),
        document.getElementById('profile-photo-preview')
    ];
    
    avatarElements.forEach(element => {
        if (element) {
            element.src = imageUrl || DEFAULT_AVATAR;
            element.onerror = function() { handleImageError(this); };
        }
    });
}

// Auth State Change Listener
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        setupUserProfile();
        loadUsers();
        updateOnlineStatus(true);
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        chatContainer.classList.add('hidden');
        if (messageListener) messageListener();
    }
});

// Updated Authentication Functions
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const isLogin = authForm.querySelector('button').textContent === 'Login';

    // Basic validation
    if (!email || !password) {
        alert("Please fill in all fields");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters");
        return;
    }

    try {
        const button = authForm.querySelector('button');
        button.disabled = true;
        button.textContent = isLogin ? 'Logging in...' : 'Signing up...';

        if (isLogin) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const credential = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(credential.user.uid).set({
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                online: true,
                displayName: email.split('@')[0] // Add a default display name
            });
        }
    } catch (error) {
        console.error("Auth error:", error);
        let errorMessage = "Authentication failed. ";
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage += "This email is already registered.";
                break;
            case 'auth/invalid-email':
                errorMessage += "Invalid email address.";
                break;
            case 'auth/operation-not-allowed':
                errorMessage += "Operation not allowed.";
                break;
            case 'auth/weak-password':
                errorMessage += "Password is too weak.";
                break;
            default:
                errorMessage += error.message;
        }
        
        alert(errorMessage);
    } finally {
        const button = authForm.querySelector('button');
        button.disabled = false;
        button.textContent = isLogin ? 'Login' : 'Sign Up';
    }
});

toggleAuth.addEventListener('click', () => {
    const button = authForm.querySelector('button');
    const isLogin = button.textContent === 'Login';
    button.textContent = isLogin ? 'Sign Up' : 'Login';
    toggleAuth.textContent = isLogin ? 'Login' : 'Sign up';
});

// Add forgot password handler
forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    
    if (!email) {
        alert('Please enter your email address first');
        document.getElementById('email').focus();
        return;
    }
    
    try {
        forgotPasswordLink.textContent = 'Sending...';
        forgotPasswordLink.style.pointerEvents = 'none';
        
        await auth.sendPasswordResetEmail(email, {
            url: window.location.href
        });
        
        alert('Password reset email sent! Please check your inbox.');
    } catch (error) {
        console.error('Error sending reset email:', error);
        let errorMessage = 'Failed to send reset email. ';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage += 'Please enter a valid email address.';
                break;
            case 'auth/user-not-found':
                errorMessage += 'No account found with this email.';
                break;
            default:
                errorMessage += error.message;
        }
        
        alert(errorMessage);
    } finally {
        forgotPasswordLink.textContent = 'Forgot Password?';
        forgotPasswordLink.style.pointerEvents = 'auto';
    }
});

// User Management
async function setupUserProfile() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    document.getElementById('user-name').textContent = userData.displayName || userData.email;
    document.getElementById('user-avatar').src = userData.photoURL || '/api/placeholder/40/40';
}

// Modify the loadUsers function
async function loadUsers() {
    const usersSnapshot = await db.collection('users').get();
    allUsers = []; // Reset users array
    userList.innerHTML = '';
    
    usersSnapshot.forEach(doc => {
        if (doc.id !== currentUser.uid) {
            const userData = doc.data();
            allUsers.push({
                id: doc.id,
                ...userData
            });
            createUserElement(doc.id, userData);
        }
    });
}

// Add new function to create user element
function createUserElement(userId, userData) {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.innerHTML = `
        <img src="${userData.photoURL || DEFAULT_AVATAR}" alt="User" onerror="handleImageError(this)">
        <div class="user-info">
            <h4>${userData.displayName || userData.email}</h4>
            <span>${userData.online ? 'online' : 'offline'}</span>
        </div>
    `;
    userEl.addEventListener('click', () => startChat(userId, userData));
    userList.appendChild(userEl);
}

// Add search functionality
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    userList.innerHTML = ''; // Clear current list

    allUsers.forEach(user => {
        const displayName = (user.displayName || user.email).toLowerCase();
        if (displayName.includes(searchTerm)) {
            createUserElement(user.id, user);
        }
    });
});

// Modify the startChat function
function startChat(userId, userData) {
    if (messageListener) messageListener();
    currentChat = userId;
    
    // Update chat header with user info including photo
    document.getElementById('chat-user-name').textContent = userData.displayName || userData.email;
    document.getElementById('chat-user-status').textContent = userData.online ? 'online' : 'offline';
    document.getElementById('chat-user-avatar').src = userData.photoURL || DEFAULT_AVATAR;
    document.getElementById('chat-user-avatar').onerror = function() { handleImageError(this); };
    
    messageListener = db.collection('messages')
        .where('chatId', 'in', [
            `${currentUser.uid}_${userId}`,
            `${userId}_${currentUser.uid}`
        ])
        .orderBy('timestamp')
        .onSnapshot(async snapshot => {
            messages.innerHTML = '';
            
            // Mark received messages as read
            const batch = db.batch();
            let hasUnread = false;
            
            snapshot.forEach(doc => {
                const message = doc.data();
                if (message.receiverId === currentUser.uid && !message.read) {
                    hasUnread = true;
                    batch.update(doc.ref, { read: true });
                }
            });
            
            if (hasUnread) {
                await batch.commit();
            }
            
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageEl = document.createElement('div');
                messageEl.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                messageEl.dataset.id = doc.id;
                
                const timestamp = formatTimestamp(message.timestamp);
                const edited = message.edited ? '<span class="edited-tag">(edited)</span>' : '';
                
                if (message.senderId === currentUser.uid) {
                    const messageText = message.fileUrl ? getMessageContentByType(message) : message.text;
                    messageEl.innerHTML = `
                        <div class="message-content">
                            <div class="message-text">${messageText}</div>
                            <div class="message-info">
                                <div class="message-meta">
                                    <span class="message-timestamp">${timestamp}</span>
                                    ${edited}
                                </div>
                                <span class="message-status">
                                    ${message.read ? 
                                        '<i class="fas fa-check-double"></i>' : 
                                        '<i class="fas fa-check"></i>'}
                                </span>
                            </div>
                        </div>
                        <button class="message-options-btn">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    `;
                } else {
                    messageEl.innerHTML = `
                        <div class="message-content">
                            ${message.fileUrl ? getMessageContentByType(message) : message.text}
                            <div class="message-info">
                                <span class="message-timestamp">${timestamp}${edited}</span>
                            </div>
                        </div>
                    `;
                }
                
                messages.appendChild(messageEl);
            });
            messages.scrollTop = messages.scrollHeight;
        });

    showChat();
}

// Helper function to get message content based on type
function getMessageContentByType(message) {
    switch(message.fileType) {
        case 'image':
            return `<img src="${message.fileUrl}" alt="Image" class="message-image">`;
        case 'video':
            return `<video controls class="message-video"><source src="${message.fileUrl}"></video>`;
        case 'audio':
            return `<audio controls class="message-audio"><source src="${message.fileUrl}"></audio>`;
        default:
            return `<a href="${message.fileUrl}" target="_blank" class="message-file">
                📎 ${message.fileName || 'Download file'}</a>`;
    }
}

sendBtn.addEventListener('click', async () => {
    if (!messageInput.value.trim() || !currentChat) return;

    const chatId = `${currentUser.uid}_${currentChat}`;
    try {
        await db.collection('messages').add({
            text: messageInput.value.trim(),
            senderId: currentUser.uid,
            receiverId: currentChat,
            chatId: chatId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        messageInput.value = '';
        messages.scrollTop = messages.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
});

// Message Input Events
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Online/Offline Status
async function updateOnlineStatus(status) {
    if (currentUser) {
        await db.collection('users').doc(currentUser.uid).update({
            online: status,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

window.addEventListener('beforeunload', () => {
    updateOnlineStatus(false);
});

// Theme Toggle
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.innerHTML = isDark ? 
        '<i class="fas fa-sun"></i>' : 
        '<i class="fas fa-moon"></i>';
});

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

// Logout
logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await updateOnlineStatus(false);
            await auth.signOut();
            
            // Clear any stored data
            localStorage.removeItem('theme');
            
            // Reset UI
            document.body.classList.remove('dark-theme');
            messageInput.value = '';
            messages.innerHTML = '';
            userList.innerHTML = '';
            
            // Show auth container
            authContainer.classList.remove('hidden');
            chatContainer.classList.add('hidden');
            
        } catch (error) {
            console.error('Logout error:', error);
            alert('Error logging out. Please try again.');
        }
    }
});

// Message Actions (Edit, Delete, Copy)
messages.addEventListener('click', async (e) => {
    const optionsBtn = e.target.closest('.message-options-btn');
    if (!optionsBtn) return;

    const messageEl = optionsBtn.closest('.message');
    const messageId = messageEl.dataset.id;
    const messageContent = messageEl.querySelector('.message-content');
    
    // Remove any existing message actions
    document.querySelectorAll('.message-actions').forEach(el => el.remove());
    
    const messageActions = document.createElement('div');
    messageActions.className = 'message-actions';
    messageActions.innerHTML = `
        <button class="copy-btn"><i class="fas fa-copy"></i> Copy</button>
        <button class="edit-btn"><i class="fas fa-edit"></i> Edit</button>
        <button class="delete-btn"><i class="fas fa-trash"></i> Delete</button>
    `;

    document.body.appendChild(messageActions);
    positionMessageMenu(messageEl, messageActions);

    // Handle action clicks
    messageActions.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        try {
            if (button.classList.contains('copy-btn')) {
                await navigator.clipboard.writeText(messageContent.textContent);
                alert('Message copied to clipboard');
            } else if (button.classList.contains('edit-btn')) {
                const messageText = messageEl.querySelector('.message-text');
                const text = messageText.textContent.trim();
                enableInlineEditing(messageText, text, messageId);
            } else if (button.classList.contains('delete-btn')) {
                if (confirm('Delete this message?')) {
                    await deleteMessageFromFirestore(messageId);
                }
            }
        } catch (error) {
            console.error('Error performing action:', error);
            alert('Failed to perform action. Please try again.');
        }

        closeMessageMenu(messageActions);
    });

    // Close menu on click outside
    document.addEventListener('click', function closeMenu(e) {
        if (!messageActions.contains(e.target) && !optionsBtn.contains(e.target)) {
            closeMessageMenu(messageActions);
            document.removeEventListener('click', closeMenu);
        }
    });
});

// Helper function to position menu
function positionMessageMenu(messageEl, messageActions) {
    if (window.innerWidth <= 768) {
        messageActions.classList.add('show');
        document.body.style.overflow = 'hidden';
    } else {
        const rect = messageEl.getBoundingClientRect();
        const menuWidth = 150; // Approximate width of menu
        const viewportWidth = window.innerWidth;
        
        // Default position (to the left of message)
        let left = rect.left - menuWidth - 5;
        
        // If menu would go off screen to the left, position it to the right of message
        if (left < 0) {
            left = rect.right + 5;
        }
        
        // If menu would go off screen to the right, position it to the left
        if (left + menuWidth > viewportWidth) {
            left = rect.left - menuWidth - 5;
        }
        
        // If still doesn't fit, position under the message
        if (left < 0) {
            left = rect.left;
            messageActions.style.top = `${rect.bottom + 5}px`;
        } else {
            messageActions.style.top = `${rect.top}px`;
        }
        
        messageActions.style.left = `${left}px`;
    }
}

// Update close menu handler
function closeMessageMenu(messageActions) {
    if (window.innerWidth <= 768) {
        messageActions.classList.remove('show');
        setTimeout(() => messageActions.remove(), 300);
        document.body.style.overflow = '';
    } else {
        messageActions.remove();
    }
}

// Add touch event handling for message actions
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    const messageActions = document.querySelector('.message-actions');
    if (messageActions) {
        touchStartY = e.touches[0].clientY;
    }
});

document.addEventListener('touchmove', (e) => {
    const messageActions = document.querySelector('.message-actions');
    if (messageActions && messageActions.classList.contains('show')) {
        const touchDiff = e.touches[0].clientY - touchStartY;
        if (touchDiff > 50) {
            closeMessageMenu(messageActions);
        }
    }
});

// File Upload
const attachBtn = document.getElementById('attach-btn');

// Replace existing file upload code with Cloudinary widget
attachBtn.addEventListener('click', () => {
    cloudinaryWidget.open();
});

// Handle successful upload
function handleUploadSuccess(info) {
    const messageText = getMessageTextByFileType(info);
    
    db.collection('messages').add({
        text: messageText,
        fileUrl: info.secure_url,
        fileType: info.resource_type,
        fileName: info.original_filename,
        fileSize: info.bytes,
        senderId: currentUser.uid,
        receiverId: currentChat,
        chatId: `${currentUser.uid}_${currentChat}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
    });
}

// Helper function to get message text based on file type
function getMessageTextByFileType(fileInfo) {
    switch(fileInfo.resource_type) {
        case 'image':
            return '📷 Image';
        case 'video':
            return '🎥 Video';
        case 'audio':
            return '🎵 Audio';
        case 'raw':
            return '📎 Document';
        default:
            return '📎 File';
    }
}

// Typing Indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!currentChat) return;

    clearTimeout(typingTimeout);
    db.collection('users').doc(currentUser.uid).update({
        typing: currentChat
    });

    typingTimeout = setTimeout(() => {
        db.collection('users').doc(currentUser.uid).update({
            typing: null
        });
    }, 2000);
});

// Initialize emoji picker
const emojiBtn = document.getElementById('emoji-btn');
emojiBtn.addEventListener('click', () => {
    // You can integrate an emoji picker library here
    alert('Emoji picker coming soon!');
});

// Add profile click handler
userProfile.addEventListener('click', () => {
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    
    // Populate current values
    profileUsername.value = currentUser.displayName || '';
    profileEmail.value = currentUser.email || '';
    profilePhotoPreview.src = currentUser.photoURL || '/api/placeholder/100/100';
    
    // Show modal
    profileModal.classList.remove('hidden');
});

// Close modal handler
closeModal.addEventListener('click', () => {
    profileModal.classList.add('hidden');
});

// Close modal when clicking outside
profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
        profileModal.classList.add('hidden');
    }
});

// Handle profile form submission
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('profile-username').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const password = document.getElementById('profile-password').value;
    const photoFile = profilePhotoInput.files[0];
    
    try {
        const button = profileForm.querySelector('button');
        button.disabled = true;
        button.textContent = 'Saving...';

        let photoURL = currentUser.photoURL;

        // Upload new photo if selected
        if (photoFile) {
            const photoRef = storage.ref(`profiles/${currentUser.uid}/${Date.now()}_${photoFile.name}`);
            const photoSnapshot = await photoRef.put(photoFile);
            photoURL = await photoSnapshot.ref.getDownloadURL();
        }

        // If email or password is changing, we need to reauthenticate first
        if (email !== currentUser.email || password) {
            // Ask for current password
            const currentPassword = prompt('Please enter your current password to confirm changes:');
            if (!currentPassword) {
                throw new Error('Current password is required for security changes');
            }

            // Create credential
            const credential = firebase.auth.EmailAuthProvider.credential(
                currentUser.email,
                currentPassword
            );

            // Reauthenticate
            await currentUser.reauthenticateWithCredential(credential);
        }

        // Update display name
        if (username !== currentUser.displayName) {
            await currentUser.updateProfile({
                displayName: username,
                photoURL: photoURL
            });
        }
        
        // Update email if changed
        if (email !== currentUser.email) {
            await currentUser.updateEmail(email);
        }
        
        // Update password if provided
        if (password) {
            await currentUser.updatePassword(password);
        }
        
        // Update Firestore user document
        await db.collection('users').doc(currentUser.uid).update({
            displayName: username,
            email: email,
            photoURL: photoURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update UI
        document.getElementById('user-name').textContent = username;
        document.getElementById('user-avatar').src = photoURL || '/api/placeholder/40/40';
        
        // Show success message
        alert('Profile updated successfully');
        profileModal.classList.add('hidden');
        
        // Clear password field
        document.getElementById('profile-password').value = '';
        
    } catch (error) {
        console.error('Error updating profile:', error);
        let errorMessage = 'Error updating profile: ';
        
        switch (error.code) {
            case 'auth/requires-recent-login':
                errorMessage += 'Please log out and log in again before making these changes.';
                break;
            case 'auth/wrong-password':
                errorMessage += 'Current password is incorrect.';
                break;
            case 'auth/weak-password':
                errorMessage += 'New password is too weak.';
                break;
            default:
                errorMessage += error.message;
        }
        
        alert(errorMessage);
    } finally {
        const button = profileForm.querySelector('button');
        button.disabled = false;
        button.textContent = 'Save Changes';
    }
});

// Add profile photo click handler
profilePhotoContainer.addEventListener('click', () => {
    const photoWidget = cloudinary.createUploadWidget(
        {
            cloudName: cloudinaryConfig.cloudName,
            uploadPreset: cloudinaryConfig.uploadPreset,
            multiple: false,
            maxFiles: 1,
            sources: ['local', 'camera'],
            resourceType: 'image',
            cropping: true,
            croppingAspectRatio: 1,
            maxFileSize: 5242880 // 5MB
        },
        async (error, result) => {
            if (!error && result && result.event === "success") {
                const photoURL = result.info.secure_url;
                
                // Update profile photo in UI
                profilePhotoPreview.src = photoURL;
                document.getElementById('user-avatar').src = photoURL;

                // Update Firebase and Firestore
                try {
                    await currentUser.updateProfile({ photoURL });
                    await db.collection('users').doc(currentUser.uid).update({
                        photoURL,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (error) {
                    console.error('Error updating profile photo:', error);
                    alert('Failed to update profile photo. Please try again.');
                }
            }
        }
    );
    photoWidget.open();
});

// Handle profile photo preview
profilePhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            profilePhotoPreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Error handling
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', error);
    // You can implement error reporting here
};

// Message handling functions
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function updateMessageInFirestore(messageId, newText) {
    try {
        await db.collection('messages').doc(messageId).update({
            text: newText,
            edited: true,
            editedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error updating message:', error);
        alert('Failed to edit message. Please try again.');
        return false;
    }
}

function deleteMessageFromFirestore(messageId) {
    return db.collection('messages').doc(messageId).delete();
}

// Add clear chat functionality
clearChatBtn.addEventListener('click', async () => {
    if (!currentChat || !confirm('Are you sure you want to clear this chat? This cannot be undone.')) {
        return;
    }

    try {
        const chatId1 = `${currentUser.uid}_${currentChat}`;
        const chatId2 = `${currentChat}_${currentUser.uid}`;
        
        const messagesQuery = await db.collection('messages')
            .where('chatId', 'in', [chatId1, chatId2])
            .get();
        
        const batch = db.batch();
        messagesQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        messages.innerHTML = '';
        alert('Chat cleared successfully');
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Failed to clear chat. Please try again.');
    }
});

// Add back button handler
backBtn.addEventListener('click', showSidebar);

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        sidebar.classList.remove('hidden');
    }
});

// Add these new functions for inline editing
function enableInlineEditing(messageTextEl, currentText, messageId) {
    messageTextEl.classList.add('editing');
    const originalContent = messageTextEl.innerHTML;
    
    messageTextEl.innerHTML = `
        <input type="text" value="${currentText}" autofocus>
        <div class="edit-actions">
            <button class="save-edit" title="Save">
                <i class="fas fa-check"></i>
            </button>
            <button class="cancel-edit" title="Cancel">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    const input = messageTextEl.querySelector('input');
    const saveBtn = messageTextEl.querySelector('.save-edit');
    const cancelBtn = messageTextEl.querySelector('.cancel-edit');

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    // Handle save
    saveBtn.addEventListener('click', async () => {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
            const success = await updateMessageInFirestore(messageId, newText);
            if (!success) {
                messageTextEl.innerHTML = originalContent;
            }
        } else {
            messageTextEl.innerHTML = originalContent;
        }
        messageTextEl.classList.remove('editing');
    });

    // Handle cancel
    cancelBtn.addEventListener('click', () => {
        messageTextEl.innerHTML = originalContent;
        messageTextEl.classList.remove('editing');
    });

    // Handle Enter key to save
    input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveBtn.click();
        }
    });

    // Handle Escape key to cancel
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });
}

// Settings handlers
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    loadSettings();
});

closeSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

// Load settings from localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('chatSettings')) || {
        theme: 'light',
        chatBgColor: '#ffffff',
        notificationSound: true,
        desktopNotifications: true,
        readReceipts: true,
        onlineStatus: true
    };

    themeSelect.value = settings.theme;
    chatBgColor.value = settings.chatBgColor;
    notificationSound.checked = settings.notificationSound;
    desktopNotifications.checked = settings.desktopNotifications;
    readReceipts.checked = settings.readReceipts;
    onlineStatus.checked = settings.onlineStatus;

    applySettings(settings);
}

// Save settings
function saveSettings() {
    const settings = {
        theme: themeSelect.value,
        chatBgColor: chatBgColor.value,
        notificationSound: notificationSound.checked,
        desktopNotifications: desktopNotifications.checked,
        readReceipts: readReceipts.checked,
        onlineStatus: onlineStatus.checked
    };

    localStorage.setItem('chatSettings', JSON.stringify(settings));
    applySettings(settings);
}

// Apply settings
function applySettings(settings) {
    // Apply theme
    if (settings.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-theme', prefersDark);
    } else {
        document.body.classList.toggle('dark-theme', settings.theme === 'dark');
    }

    // Apply chat background color
    document.querySelector('.messages').style.backgroundColor = settings.chatBgColor;

    // Update online status in Firebase
    if (currentUser) {
        updateOnlineStatus(settings.onlineStatus);
    }
}

// Add event listeners for settings changes
[themeSelect, chatBgColor, notificationSound, desktopNotifications, readReceipts, onlineStatus]
    .forEach(element => {
        element.addEventListener('change', saveSettings);
    });

// Request notification permission
if ('Notification' in window) {
    desktopNotifications.addEventListener('change', async (e) => {
        if (e.target.checked) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                e.target.checked = false;
                alert('Please allow notifications to enable this feature.');
            }
        }
    });
}

// Modify the existing window.matchMedia listener
window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
    const settings = JSON.parse(localStorage.getItem('chatSettings')) || {};
    if (settings.theme === 'system') {
        loadSettings();
    }
});

// Load settings on startup
loadSettings();