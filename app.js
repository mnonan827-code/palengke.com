// Import Cloudinary uploader
import { initializeCloudinary } from './cloudinary-uploader.js';
import { 
    auth, 
    database, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    ref, 
    set, 
    get, 
    update, 
    remove, 
    onValue, 
    push,
    cloudinaryConfig,
    sendEmailVerification 
} from './firebase-config.js';

console.log("DOM loaded, main container:", document.getElementById("main"));

// Initialize Lucide Icons
lucide.createIcons();

// Initialize Cloudinary
let cloudinary;
try {
    console.log('Initializing Cloudinary with config:', cloudinaryConfig);
    cloudinary = initializeCloudinary(cloudinaryConfig);
    console.log('Cloudinary initialized successfully');
} catch (error) {
    console.error('Failed to initialize Cloudinary:', error);
    cloudinary = {
        uploadImage: () => Promise.reject(new Error('Cloudinary not initialized'))
    };
}

// Global app state
window.APP_STATE = {
    products: [],
    orders: [],
    cart: [],
    currentUser: null,
    view: 'shop',
    deliveryFee: 25.00,
    adminView: 'dashboard',
    searchQuery: '',
    orderSearchQuery: '',        // ✅ Add this
    preorderSearchQuery: '',      // ✅ Add this
    chats: [], // 🟢 ADD THIS LINE
};

const CART_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
let cartActivityTimer = null;

const APP_KEY = 'palengke_cainta_v4';

const CAINTA_BARANGAYS = [
    'San Andres',
    'San Juan',
    'Santa Rosa',
    'Santo Domingo',
    'Santo Niño',
    'San Isidro',
    'San Roque',
    'Santisima Trinidad'
];

const VALID_ID_TYPES = [
    'UMID ID',
    'Driver\'s License',
    'Philippine Passport',
    'National ID',
    'Postal ID',
    'Voter\'s ID'
];

const dbRefs = {
    products: ref(database, 'products'),
    orders: ref(database, 'orders'),
    users: ref(database, 'users'),
    carts: ref(database, 'carts'),
    notifications: ref(database, 'notifications'),
    deleteLogs: ref(database, 'deleteLogs'),
    chats: ref(database, 'chats')
};

// Helper to safely initialize Lucide icons
window.safeIconInit = function() {
    try {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } catch (error) {
        console.warn('Icon initialization failed:', error);
    }
};

// Debounce utility function
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Search functionality
window.handleSearch = debounce(function(query) {
    const trimmedQuery = query.toLowerCase().trim();
    window.APP_STATE.searchQuery = trimmedQuery;
    
    // Update UI immediately without full re-render
    const filteredProducts = filterProducts(window.APP_STATE.products);
    updateSearchResultsCount(filteredProducts.length, window.APP_STATE.products.length);
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !trimmedQuery);
    }
    
    // Only re-render if on shop view
    if (window.APP_STATE.view === 'shop') {
        renderMain();
    }
}, 300); // 300ms debounce

window.clearSearch = function() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    window.APP_STATE.searchQuery = '';
    renderMain();
};

window.handleOrderSearch = function(query, type = 'regular') {
    console.log(`🔍 handleOrderSearch called: "${query}" [${type}]`);
    
    // Update state immediately
    if (type === 'regular') {
        window.APP_STATE.orderSearchQuery = query.toLowerCase().trim();
    } else {
        window.APP_STATE.preorderSearchQuery = query.toLowerCase().trim();
    }
    
    // Get orders
    const orders = type === 'regular' 
        ? window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order')
        : window.APP_STATE.orders.filter(o => o.type === 'pre-order');
    
    const searchQuery = type === 'regular' ? window.APP_STATE.orderSearchQuery : window.APP_STATE.preorderSearchQuery;
    const filteredOrders = filterOrders(orders, searchQuery);
    
    // Update counts immediately
    updateOrderSearchResultsCount(filteredOrders.length, orders.length, type);
    
    // Update clear button visibility
    const clearBtn = document.getElementById(type === 'regular' ? 'clear-order-search-btn' : 'clear-preorder-search-btn');
    if (clearBtn) {
        if (searchQuery) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
    
    // ✅ Update table display without full re-render
    updateOrderTableDisplay(filteredOrders, type);
};

// ✅ NEW: Update order table rows without full page re-render
window.updateOrderTableDisplay = function(filteredOrders, type = 'regular') {
    const tableId = type === 'regular' ? 'regular-orders-tbody' : 'preorder-orders-tbody';
    const tbody = document.getElementById(tableId);
    
    if (!tbody) {
        console.log('⚠️ Table body not found:', tableId);
        return;
    }
    
    // Generate new rows HTML
    const rowsHtml = filteredOrders.length > 0 ? filteredOrders.map(o => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
            <td class="px-3 py-2 text-sm">${o.customer}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
            <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
                    o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                    o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
                    o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
                    type === 'regular' ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800'
                }">${o.status}</span>
            </td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">${o.date}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminViewOrder('${o.id}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View</button>
                    <button onclick="adminEditOrder('${o.id}')" class="px-2 py-1 text-xs bg-lime-600 text-white rounded hover:bg-lime-700">Update</button>
                    <button onclick="adminDeleteOrder('${o.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `).join('') : `<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="6">No ${type} orders found</td></tr>`;
    
    // Update table content
    tbody.innerHTML = rowsHtml;
    
    // Reinitialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
};

window.clearOrderSearch = function(type = 'regular') {
    console.log(`🧹 Clearing ${type} order search`);
    
    // Clear the input
    const searchInput = document.getElementById(type === 'regular' ? 'order-search-input' : 'preorder-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Clear the state
    if (type === 'regular') {
        window.APP_STATE.orderSearchQuery = '';
    } else {
        window.APP_STATE.preorderSearchQuery = '';
    }
    
    // Hide clear button
    const clearBtn = document.getElementById(type === 'regular' ? 'clear-order-search-btn' : 'clear-preorder-search-btn');
    if (clearBtn) {
        clearBtn.classList.add('hidden');
    }
    
    // Update table to show all orders
    const orders = type === 'regular' 
        ? window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order')
        : window.APP_STATE.orders.filter(o => o.type === 'pre-order');
    
    updateOrderTableDisplay(orders, type);
    updateOrderSearchResultsCount(orders.length, orders.length, type);
};

// ✅ NEW: Update table rows without full page re-render
window.updateOrderTableRows = function(filteredOrders, type = 'regular') {
    const tableId = type === 'regular' ? 'regular-orders-tbody' : 'preorder-orders-tbody';
    const tbody = document.getElementById(tableId);
    
    if (!tbody) {
        console.log('⚠️ Table body not found:', tableId);
        return;
    }
    
    // Generate new rows HTML
    const rowsHtml = filteredOrders.length > 0 ? filteredOrders.map(o => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
            <td class="px-3 py-2 text-sm">${o.customer}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
            <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
                    o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                    o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
                    o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
                    type === 'regular' ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800'
                }">${o.status}</span>
            </td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">${o.date}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminViewOrder('${o.id}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View</button>
                    <button onclick="adminEditOrder('${o.id}')" class="px-2 py-1 text-xs bg-lime-600 text-white rounded hover:bg-lime-700">Update</button>
                    <button onclick="adminDeleteOrder('${o.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `).join('') : `<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="6">No ${type} orders found</td></tr>`;
    
    // Update table content
    tbody.innerHTML = rowsHtml;
    
    // Reinitialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
};

window.filterOrders = function(orders, searchQuery) {
    if (!searchQuery) return orders;
    
    return orders.filter(o => {
        const searchLower = searchQuery;
        return (
            o.id.toLowerCase().includes(searchLower) ||
            o.customer.toLowerCase().includes(searchLower) ||
            o.email.toLowerCase().includes(searchLower) ||
            o.contact.includes(searchLower) ||
            o.status.toLowerCase().includes(searchLower)
        );
    });
};

window.updateOrderSearchResultsCount = function(filteredCount, totalCount, type = 'regular') {
    const countDiv = document.getElementById(type === 'regular' ? 'order-search-results-count' : 'preorder-search-results-count');
    const clearBtn = document.getElementById(type === 'regular' ? 'clear-order-search-btn' : 'clear-preorder-search-btn');
    
    const searchQuery = type === 'regular' ? window.APP_STATE.orderSearchQuery : window.APP_STATE.preorderSearchQuery;
    
    if (countDiv) {
        if (searchQuery) {
            countDiv.innerHTML = `Showing <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> orders`;
            countDiv.classList.remove('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
        } else {
            countDiv.innerHTML = '';
            countDiv.classList.add('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }
};
window.filterProducts = function(products) {
    if (!window.APP_STATE.searchQuery) return products;
    
    return products.filter(p => {
        const searchLower = window.APP_STATE.searchQuery;
        return (
            p.name.toLowerCase().includes(searchLower) ||
            p.origin.toLowerCase().includes(searchLower) ||
            p.farmer.name.toLowerCase().includes(searchLower) ||
            (p.description && p.description.toLowerCase().includes(searchLower))
        );
    });
};

window.updateSearchResultsCount = function(filteredCount, totalCount) {
    const countDiv = document.getElementById('search-results-count');
    const clearBtn = document.getElementById('clear-search-btn');
    const searchInput = document.getElementById('search-input');
    
    if (countDiv) {
        if (window.APP_STATE.searchQuery) {
            countDiv.innerHTML = `Showing <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> products`;
            if (clearBtn) clearBtn.classList.remove('hidden');
        } else {
            countDiv.innerHTML = '';
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }
    
    // Show/hide clear button in input
    if (searchInput && searchInput.value) {
        if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
        if (clearBtn) clearBtn.classList.add('hidden');
    }
};

// Make functions globally available
window.saveToFirebase = async function(path, data) {
    try {
        await set(ref(database, path), data);
        return true;
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        return false;
    }
};

window.getFromFirebase = async function(path) {
    try {
        const snapshot = await get(ref(database, path));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error('Error reading from Firebase:', error);
        return null;
    }
};

window.updateFirebase = async function(path, updates) {
    try {
        await update(ref(database, path), updates);
        return true;
    } catch (error) {
        console.error('Error updating Firebase:', error);
        return false;
    }
};

// Mobile menu functionality
window.toggleMobileMenu = function() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    
    if (!mobileMenu || !mobileMenuBtn) return;
    
    const isOpen = mobileMenu.classList.contains('active');
    
    if (isOpen) {
        // Close menu
        mobileMenu.classList.remove('active');
        mobileMenu.classList.add('hidden');
        document.body.classList.remove('mobile-menu-open');
        
        // Update icon
        const icon = mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'menu');
        }
    } else {
        // Open menu
        mobileMenu.classList.remove('hidden');
        mobileMenu.classList.add('active');
        document.body.classList.add('mobile-menu-open');
        
        // Update icon
        const icon = mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'x');
        }
    }
    
    lucide.createIcons();
};

window.closeMobileMenu = function() {
    const mobileMenu = document.getElementById("mobile-menu");
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    
    if (mobileMenu) {
        mobileMenu.classList.remove("active");
        mobileMenu.classList.add("hidden");
        document.body.classList.remove("mobile-menu-open");
        
        // Update icon
        if (mobileMenuBtn) {
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', 'menu');
                lucide.createIcons();
            }
        }
    }
};

async function initializeFirebaseData() {
    
    try {
        // ✅ STEP 1: Load Products
        const productsSnapshot = await get(dbRefs.products);
        if (productsSnapshot.exists()) {
    const productsData = productsSnapshot.val();
    window.APP_STATE.products = Object.values(productsData);
} else {
    console.log('⚠️ No products found in database.');
    window.APP_STATE.products = [];
}


        // ✅ STEP 2: Load Orders
        console.log('📋 Loading orders...');
        const ordersSnapshot = await get(dbRefs.orders);
        if (ordersSnapshot.exists()) {
            const ordersData = ordersSnapshot.val();
            window.APP_STATE.orders = Object.values(ordersData);
            console.log('✅ Orders loaded:', window.APP_STATE.orders.length);
        } else {
            window.APP_STATE.orders = [];
            console.log('⚠️ No orders found');
        }

        // ✅ STEP 3: Load Delivery Fee
        console.log('💰 Loading delivery fee...');
        const deliveryFeeSnapshot = await get(ref(database, 'settings/deliveryFee'));
        if (deliveryFeeSnapshot.exists()) {
            window.APP_STATE.deliveryFee = deliveryFeeSnapshot.val();
            console.log('✅ Delivery fee loaded:', window.APP_STATE.deliveryFee);
        } else {
            window.APP_STATE.deliveryFee = 25.00;
            await set(ref(database, 'settings/deliveryFee'), 25.00);
            console.log('✅ Default delivery fee set');
        }

        // ✅ STEP 4: Load Chats
        console.log('💬 Loading chats...');
        const chatsSnapshot = await get(dbRefs.chats);
        if (chatsSnapshot.exists()) {
            const chatsData = chatsSnapshot.val();
            window.APP_STATE.chats = Object.keys(chatsData).map(chatId => ({
                id: chatId,
                ...chatsData[chatId]
            }));
            console.log('✅ Chats loaded:', window.APP_STATE.chats.length);
        } else {
            window.APP_STATE.chats = [];
            console.log('⚠️ No chats found');
        }

        // ✅ STEP 5: Setup Real-time Listeners
        console.log('🎧 Setting up real-time listeners...');
        setupRealtimeListeners();
        
        // ✅ STEP 6: Update Pre-order Statuses
        updatePreorderStatuses();
        
        // ✅ STEP 7: Render Main Content
        await renderMain();
        
        console.log('✅ Firebase initialization complete');
        
        // ✅ Check for abandoned carts on startup
        await checkAbandonedCartOnStartup();
        
        // ✅ Start global abandoned cart cleanup
        startGlobalAbandonedCartCleanup();
        
        // ✅ STEP 8: Verify sync
        setTimeout(() => {
            window.verifyDatabaseSync();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error initializing Firebase data:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
    }
}

async function createDefaultAdmin() {
    const adminEmail = "lgucainta@gmail.com";
    const adminPassword = "LGUCAINTA2025";
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
        const user = userCredential.user;

        const adminData = {
            uid: user.uid,
            email: adminEmail,
            name: "LGU Cainta Admin",
            role: 'admin',
            createdAt: new Date().toISOString()
        };

        await saveToFirebase(`users/${user.uid}`, adminData);
        await saveToFirebase('settings/deliveryFee', 25.00);

        console.log("Default delivery fee set");
        console.log("Default admin account created successfully");
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log("Admin account already exists");
        } else {
            console.error("Error creating admin account:", error);
        }
    }
}

// In app.js (Add these functions)

// Utility function to generate a simple unique ID for new chat threads
const uid = () => 'C' + Date.now().toString(36) + Math.random().toString(36).substring(2);

// Find or create a chat thread ID for the current user (UID for logged in, Session ID for guest)
// Find or create a chat thread ID for the current user (UID for logged in, Session ID for guest)
window.getChatThreadId = function() {
    if (!window.APP_STATE.currentUser) {
        let guestId = sessionStorage.getItem('guestChatId');
        if (!guestId) {
            guestId = 'GUEST-' + uid();
            sessionStorage.setItem('guestChatId', guestId);
        }
        return guestId;
    }
    return window.APP_STATE.currentUser.uid;
};

// Send a chat message (customer or admin)
// Send a chat message (customer or admin)
// Send a chat message (customer or admin)
// Send a chat message (customer or admin)
window.sendChatMessage = async function(threadId, sender, messageText, role) {
    if (!messageText.trim()) return;

    console.log('📤 Sending message:', { threadId, sender, role, messageText });

    const timestamp = new Date().toISOString();
    
    // ✅ NEW FIX: Remove multiple consecutive spaces but preserve single line breaks
    const processedText = messageText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    
    const newMessage = {
        id: uid(),
        sender: sender,
        text: processedText,
        role: role,
        timestamp: timestamp
    };
    
    // ... rest of the function stays the same
    
    try {
        const chatRef = ref(database, `chats/${threadId}`);
        const chatSnapshot = await get(chatRef);
        const chatData = chatSnapshot.exists() ? chatSnapshot.val() : null;
        
        console.log('💾 Current chat data:', chatData);
        
        const updates = {
            lastMessageAt: timestamp,
            lastMessageBy: sender,
            lastMessageText: newMessage.text.substring(0, 100), // Truncate for preview
            unreadCustomer: role === 'admin' ? true : false,
            unreadAdmin: role === 'customer' ? true : false
        };

        if (!chatData) {
            console.log('🆕 Creating new chat thread');
            const messageListRef = ref(database, `chats/${threadId}/messages`);
            await push(messageListRef, newMessage);
            
            const initialChatData = {
    customerName: window.APP_STATE.currentUser ? window.APP_STATE.currentUser.name : 'Guest',
    customerUid: window.APP_STATE.currentUser ? window.APP_STATE.currentUser.uid : null,
    status: 'open',
    conversationEnded: false, // ✅ NEW: Track if conversation was ended
    conversationEndedAt: null, // ✅ NEW: Track when conversation was ended
    conversationEndedBy: null, // ✅ NEW: Track who ended the conversation
    autoResponseSent: false,
    ...updates
};
            await update(chatRef, initialChatData);
            
            if (role === 'customer') {
                console.log('🤖 Triggering auto-response...');
                setTimeout(() => {
                    window.sendAutoAdminResponse(threadId);
                }, 1500);
            }
        } else {
            console.log('📝 Appending to existing thread');
            const messageListRef = ref(database, `chats/${threadId}/messages`);
            await push(messageListRef, newMessage);
            await update(chatRef, updates);
            
            // ✅ UPDATED: Check if conversation was ended before sending auto-response
if (role === 'customer' && (!chatData.autoResponseSent || chatData.conversationEnded)) {
    console.log('🤖 Sending auto-response to existing/restarted thread...');
    
    // If conversation was ended, reset the flag
    if (chatData.conversationEnded) {
        await update(chatRef, {
            conversationEnded: false,
            conversationEndedAt: null,
            conversationEndedBy: null,
            autoResponseSent: false
        });
    }
    
    setTimeout(() => {
        window.sendAutoAdminResponse(threadId);
    }, 1500);
}
        }
        
        console.log('✅ Message sent successfully');
        
        // Clear input
        const chatInput = document.getElementById(`chat-input-${threadId}`);
        if(chatInput) chatInput.value = '';

    } catch (error) {
        console.error('❌ Error sending chat message:', error);
        showModal('Error', 'Failed to send message. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// ✅ NEW: Send automatic admin welcome message
// ✅ NEW: Send automatic admin welcome message
// ✅ NEW: Send automatic admin welcome message
window.sendAutoAdminResponse = async function(threadId) {
    console.log('🤖 Starting auto-response for thread:', threadId);
    
    const autoMessage = `Hi there! 👋

We'd love to help you with your concern. Could you please share the following details?

📋 Please provide:

  • Name:
  • Order ID:
  • Is the product on Pre-Order (Yes or No)?
  • Concern:

Once we have your details, we'll check right away and get back to you as soon as possible.

💌 You can also reach us at lgucainta@gmail.com.

— Admin Team, LGU Cainta`;

    const timestamp = new Date().toISOString();
    const welcomeMessage = {
        id: uid(),
        sender: 'Admin (Auto)',
        text: autoMessage,
        role: 'admin',
        timestamp: timestamp,
        isAutoResponse: true
    };
    
    try {
        console.log('💾 Saving auto-response to Firebase...');
        const chatRef = ref(database, `chats/${threadId}`);
        const messageListRef = ref(database, `chats/${threadId}/messages`);
        
        await push(messageListRef, welcomeMessage);
        console.log('✅ Auto-response message saved');
        
        const updates = {
            lastMessageAt: timestamp,
            lastMessageBy: 'Admin (Auto)',
            lastMessageText: 'Auto-welcome message sent',
            unreadCustomer: true,
            unreadAdmin: false,
            autoResponseSent: true
        };
        
        await update(chatRef, updates);
        console.log('✅ Thread metadata updated');
        
        const chatWindow = document.getElementById('customer-chat-window');
        if (chatWindow && !chatWindow.classList.contains('hidden')) {
            window.renderChatWindowUI();
            setTimeout(() => {
                window.scrollToChatBottom(threadId);
            }, 300);
        }
        
    } catch (error) {
        console.error('❌ Error sending auto-response:', error);
        console.error('Error details:', error.message);
    }
};

// ✅ NEW FUNCTION: End conversation
window.endChatConversation = async function(threadId) {
    if (!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    showModal(
        'End Conversation',
        `
        <div class="space-y-3">
            <div class="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500">
                <p class="text-yellow-800 text-sm">
                    <strong>⚠️ Are you sure?</strong><br>
                    Ending this conversation will:
                </p>
                <ul class="list-disc pl-5 mt-2 text-sm text-yellow-700 space-y-1">
                    <li>Mark the conversation as resolved</li>
                    <li>Send an automated welcome message when the customer messages again</li>
                    <li>Create a new conversation thread for future messages</li>
                </ul>
            </div>
        </div>
        `,
        `
        <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
        <button onclick="confirmEndConversation('${threadId}')" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">End Conversation</button>
        `
    );
};

// ✅ NEW FUNCTION: Confirm end conversation
window.confirmEndConversation = async function(threadId) {
    try {
        const chatRef = ref(database, `chats/${threadId}`);
        const timestamp = new Date().toISOString();
        
        // Send a system message to notify conversation has ended
        const systemMessage = {
            id: uid(),
            sender: 'System',
            text: '--- Conversation ended by admin ---',
            role: 'system',
            timestamp: timestamp,
            isSystemMessage: true
        };
        
        const messageListRef = ref(database, `chats/${threadId}/messages`);
        await push(messageListRef, systemMessage);
        
        // Update conversation status
        await update(chatRef, {
            conversationEnded: true,
            conversationEndedAt: timestamp,
            conversationEndedBy: window.APP_STATE.currentUser.email,
            status: 'resolved',
            autoResponseSent: false // Reset so auto-response sends again
        });
        
        hideModal();
        
        showModal(
            '✅ Conversation Ended',
            `
            <div class="text-center space-y-3">
                <div class="text-5xl">✅</div>
                <p class="text-gray-700">The conversation has been ended successfully.</p>
                <p class="text-sm text-gray-600">When the customer messages again, they will receive a new automated welcome message.</p>
            </div>
            `,
            `<button onclick="hideModal(); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`
        );
        
    } catch (error) {
        console.error('❌ Error ending conversation:', error);
        showModal('Error', 'Failed to end conversation. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Update unread status
window.markChatAsRead = async function(threadId, role) {
    const field = role === 'customer' ? 'unreadCustomer' : 'unreadAdmin';
    try {
        await update(ref(database, `chats/${threadId}`), { [field]: false });
    } catch (error) {
        console.error(`Error marking chat read for ${role}:`, error);
    }
};

// Scroll to bottom of chat container
window.scrollToChatBottom = function(threadId) {
    const messagesContainer = document.getElementById(`chat-messages-${threadId}`);
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};

// Render the messages for the customer chat window
window.renderCustomerChatWindow = function() {
    const threadId = window.getChatThreadId();
    const thread = window.APP_STATE.chats.find(c => c.id === threadId || c.customerUid === threadId);
    const messages = thread?.messages ? Object.values(thread.messages) : [];
    
    const senderName = window.APP_STATE.currentUser ? window.APP_STATE.currentUser.name : 'Guest';
    const senderRole = 'customer';

    if (thread && thread.unreadCustomer) {
        window.markChatAsRead(threadId, 'customer');
    }

const messagesHtml = messages.map(msg => {
    // System messages
    if (msg.isSystemMessage) {
        return `
            <div class="text-center my-3">
                <div class="inline-block px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-xs border border-gray-300">
                    ${escapeHtml(msg.text)}
                </div>
            </div>
        `;
    }
    
    const isCustomer = msg.role === 'customer';
    const isAutoResponse = msg.isAutoResponse || false;
    
    const msgClass = isCustomer 
        ? 'bg-lime-600 text-white self-end rounded-br-none' 
        : (isAutoResponse 
            ? 'bg-blue-50 text-gray-800 self-start rounded-tl-none border border-blue-200' 
            : 'bg-gray-200 text-gray-800 self-start rounded-tl-none');
    
    const nameText = isCustomer ? senderName : (isAutoResponse ? 'Admin (Auto) 🤖' : 'Admin');
    
    // Process message text - preserve line breaks properly
    let formattedText;
    if (isAutoResponse) {
        formattedText = `<pre class="chat-message-text" style="font-family: inherit; white-space: pre-wrap; margin: 0; padding: 0;">${escapeHtml(msg.text)}</pre>`;
    } else {
        // Replace newlines with <br> tags
        const textWithBreaks = escapeHtml(msg.text).replace(/\n/g, '<br>');
        formattedText = `<div class="chat-message-text">${textWithBreaks}</div>`;
    }
    
    return `
        <div class="chat-message-item flex flex-col ${isCustomer ? 'items-end' : 'items-start'} mb-3">
            <div class="text-xs ${isAutoResponse ? 'text-blue-600 font-semibold' : 'text-gray-500'} mb-1">
                ${nameText} - ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div class="${msgClass} max-w-xs p-3 rounded-xl shadow-sm">
                ${formattedText}
            </div>
        </div>
    `;
}).join('');

    return `
        <div id="chat-window-content-${threadId}" class="flex flex-col h-full">
            <div class="p-4 border-b border-gray-200 flex-shrink-0">
                <h3 class="font-bold text-lg text-gray-800">Customer Support Chat</h3>
                <p class="text-sm text-gray-500">How can we help you today?</p>
            </div>
            <div id="chat-messages-${threadId}" class="flex-grow p-4 overflow-y-auto custom-scroll space-y-3 bg-gray-50">
                ${messagesHtml.length > 0 ? messagesHtml : '<div class="text-center text-gray-500 p-5">Start a conversation!</div>'}
            </div>
            <div class="p-4 border-t border-gray-200 flex-shrink-0">
                <div class="flex gap-2">
                    <textarea id="chat-input-${threadId}" 
                              rows="1"
                              class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-lime-500 focus:border-lime-500 text-sm resize-none" 
                              placeholder="Type your message... (Shift+Enter for new line)"
                              onkeydown="handleChatInputKeydown(event, '${threadId}', '${senderName}', '${senderRole}')"
                              oninput="autoResizeChatInput(this)"></textarea>
                    <button id="chat-send-btn-${threadId}" 
                            onclick="window.sendChatMessage('${threadId}', '${senderName}', document.getElementById('chat-input-${threadId}').value, '${senderRole}')"
                            class="p-3 bg-lime-600 text-white rounded-lg hover:bg-lime-700 transition flex-shrink-0">
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
};

// Central render function for customer chat window (called on toggle)
window.renderChatWindowUI = function() {
    console.log('🎨 Rendering chat window UI...');
    const chatWindowContent = document.getElementById('customer-chat-window-content');
    if (chatWindowContent) {
        chatWindowContent.innerHTML = window.renderCustomerChatWindow();
        lucide.createIcons();
        
        // Force scroll to bottom after render
        const threadId = window.getChatThreadId();
        setTimeout(() => {
            window.scrollToChatBottom(threadId);
        }, 100);
    }
};

// Toggle customer chat window
window.toggleCustomerChat = function(force) {
    const chatWindow = document.getElementById('customer-chat-window');
    const bubbleIcon = document.getElementById('chat-bubble-icon');
    
    if (chatWindow.classList.contains('hidden') || force === true) {
        chatWindow.classList.remove('hidden');
        bubbleIcon.setAttribute('data-lucide', 'x');
        window.renderChatWindowUI();
        setTimeout(() => window.scrollToChatBottom(window.getChatThreadId()), 50);
        
        // Hide the unread indicator
        const indicator = document.getElementById('chat-unread-indicator');
        if (indicator) indicator.classList.add('hidden');
        
    } else {
        chatWindow.classList.add('hidden');
        bubbleIcon.setAttribute('data-lucide', 'message-circle');
    }
    lucide.createIcons();
};

// Render unread indicator on the customer bubble
window.renderChatBubbleIndicator = function() {
    const indicator = document.getElementById('chat-unread-indicator');
    if (!indicator) return;

    const threadId = window.getChatThreadId();
    // Search by threadId (guest) or customerUid (logged in user)
    const thread = window.APP_STATE.chats.find(c => c.id === threadId || c.customerUid === threadId);

    if (thread && thread.unreadCustomer) {
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
    }
};

// Manual sync function
window.forceDatabaseSync = async function() {
    console.log('🔄 Forcing database sync...');
    
    try {
        await initializeFirebaseData();
        showModal('Sync Complete', 'Database has been synchronized successfully.', 
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        showModal('Sync Failed', 'Failed to synchronize database: ' + error.message,
            `<button onclick="hideModal()" class="px-4 py-2 bg-red-600 text-white rounded">OK</button>`);
    }
};
// Admin Chat Modal Functionality

window.openAdminChatModal = function(threadId) {
    const thread = window.APP_STATE.chats.find(c => c.id === threadId || c.customerUid === threadId);
    if (!thread) {
        return showModal('Error', 'Chat thread not found.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    if (thread.unreadAdmin) {
        window.markChatAsRead(thread.id, 'admin');
    }

    const messages = thread.messages ? Object.values(thread.messages) : [];
    
    const messagesHtml = messages.map(msg => {
        // ✅ Handle system messages
        if (msg.isSystemMessage) {
            return `
                <div class="text-center my-3">
                    <div class="inline-block px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-xs border border-gray-300">
                        ${escapeHtml(msg.text)}
                    </div>
                </div>
            `;
        }
        
        const isAdmin = msg.role === 'admin';
        const isAutoResponse = msg.isAutoResponse || false;
        
        const msgClass = isAdmin 
            ? (isAutoResponse 
                ? 'bg-blue-50 text-gray-800 self-end rounded-br-none border border-blue-200' 
                : 'bg-lime-600 text-white self-end rounded-br-none')
            : 'bg-gray-200 text-gray-800 self-start rounded-tl-none';
        
        const nameText = isAdmin ? (isAutoResponse ? 'Admin (Auto) 🤖' : 'Admin') : thread.customerName;
        
        // ✅ FIXED: Proper line break handling for all messages
        const formattedText = isAutoResponse 
            ? `<pre class="chat-message-text">${escapeHtml(msg.text)}</pre>`
            : `<div class="chat-message-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`;
        
        return `
            <div class="chat-message-item ${isAdmin ? 'items-end' : 'items-start'} mb-3">
                <div class="text-xs ${isAutoResponse ? 'text-blue-600 font-semibold' : 'text-gray-500'} mb-1">
                    ${nameText} - ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div class="${msgClass} chat-message-bubble">
                    ${formattedText}
                </div>
            </div>
        `;
    }).join('');

    const modalTitle = `Chat with ${thread.customerName || thread.id}`;
    const modalContent = `
        <div class="flex flex-col h-full admin-chat-container">
            <div id="chat-messages-${thread.id}" class="flex-grow p-4 overflow-y-auto custom-scroll space-y-3 bg-gray-50 rounded-lg mb-3 border">
                ${messagesHtml.length > 0 ? messagesHtml : '<div class="text-center text-gray-500 p-5">Start a conversation!</div>'}
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <textarea id="chat-input-${thread.id}" 
                          rows="1"
                          class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-lime-500 focus:border-lime-500 text-sm resize-none" 
                          placeholder="Type your reply... (Shift+Enter for new line)"
                          onkeydown="handleChatInputKeydown(event, '${thread.id}', '${window.APP_STATE.currentUser.name}', 'admin')"
                          oninput="autoResizeChatInput(this)"></textarea>
                <button id="chat-send-btn-${thread.id}" 
                        onclick="window.sendChatMessage('${thread.id}', '${window.APP_STATE.currentUser.name}', document.getElementById('chat-input-${thread.id}').value, 'admin')"
                        class="p-3 bg-lime-600 text-white rounded-lg hover:bg-lime-700 transition flex-shrink-0">
                    <i data-lucide="send" class="w-5 h-5"></i>
                </button>
            </div>
        </div>
    `;
    
    const modalActions = `
    <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Close</button>
    ${!thread.conversationEnded ? 
        `<button onclick="endChatConversation('${thread.id}')" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2">
            <i data-lucide="x-circle" class="w-4 h-4"></i>
            <span>End Conversation</span>
        </button>` 
        : ''}
`;

    showModal(modalTitle, modalContent, modalActions, true);

    const modalOverlay = document.getElementById('modal-overlay');
    modalOverlay.setAttribute('data-chat-id', thread.id);

    setTimeout(() => {
        lucide.createIcons();
        const messagesContainer = document.getElementById(`chat-messages-${thread.id}`);
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, 100);
};

// 🆕 NEW FUNCTION: Real-time listener for admin chat modal
window.setupAdminChatListener = function(threadId) {
    const chatRef = ref(database, `chats/${threadId}`);
    
    onValue(chatRef, (snapshot) => {
        if (snapshot.exists()) {
            const thread = { id: threadId, ...snapshot.val() };
            const messages = thread.messages ? Object.values(thread.messages) : [];
            
            const messagesContainer = document.getElementById(`chat-messages-${threadId}`);
            if (!messagesContainer) return; // Modal is closed
            
            const isScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
            
            const messagesHtml = messages.map(msg => {
                const isAdmin = msg.role === 'admin';
                const msgClass = isAdmin ? 'bg-lime-600 text-white self-end rounded-br-none' : 'bg-gray-200 text-gray-800 self-start rounded-tl-none';
                const nameText = isAdmin ? 'Admin' : thread.customerName;
                
                return `
                    <div class="flex flex-col ${isAdmin ? 'items-end' : 'items-start'} mb-3">
                        <div class="text-xs text-gray-500 mb-1">${nameText} - ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div class="${msgClass} max-w-xs p-3 rounded-xl shadow-sm">
                            ${msg.text}
                        </div>
                    </div>
                `;
            }).join('');
            
            messagesContainer.innerHTML = messagesHtml.length > 0 ? messagesHtml : '<div class="text-center text-gray-500 p-5">Start a conversation!</div>';
            
            if (isScrolledToBottom) {
                setTimeout(() => window.scrollToChatBottom(threadId), 50);
            }
        }
    });
};;

// In app.js (Add this function)

// Function to control which chat interface is visible based on user role
// Function to control which chat interface is visible based on user role
window.updateChatVisibility = function() {
    // Check if the current user is logged in AND has the 'admin' role
    const isAdmin = window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin';
    // ✅ Customer must be logged in (not admin, but logged in)
    const isCustomerLoggedIn = window.APP_STATE.currentUser && window.APP_STATE.currentUser.role !== 'admin';
    
    // Get the chat containers
    const customerChatContainer = document.getElementById('customer-chat-container');
    const adminChatArea = document.getElementById('admin-chat-area');
    
    // 1. Customer Chat Bubble (Visible ONLY to logged-in customers)
    if (customerChatContainer) {
        if (isCustomerLoggedIn) {
            customerChatContainer.classList.remove('hidden');
            // Check for unread messages once chat is visible
            window.renderChatBubbleIndicator(); 
        } else {
            customerChatContainer.classList.add('hidden');
            // Ensure the window is closed if not a logged-in customer
            const chatWindow = document.getElementById('customer-chat-window');
            if(chatWindow && !chatWindow.classList.contains('hidden')) {
                window.toggleCustomerChat(false); // Force close
            }
        }
    }
    
    // 2. Admin Chat Dropdown (Visible ONLY to admins)
    if (adminChatArea) {
        if (isAdmin) {
            adminChatArea.classList.remove('hidden');
            // Render the dropdown content and badge
            window.renderAdminChatDropdown();
        } else {
            adminChatArea.classList.add('hidden');
        }
    }
};

// Render Admin Chat Dropdown Content
window.renderAdminChatDropdown = function() {
    const chatDropdownContent = document.getElementById('admin-chat-dropdown-content');
    const chatBadge = document.getElementById('admin-chat-badge');
    
    if (!chatDropdownContent) return;

    const unreadChats = window.APP_STATE.chats.filter(c => c.unreadAdmin).length;
    
    if (chatBadge) {
        if (unreadChats > 0) {
            chatBadge.classList.remove('hidden');
            chatBadge.textContent = unreadChats;
        } else {
            chatBadge.classList.add('hidden');
        }
    }

    if (window.APP_STATE.chats.length === 0) {
        chatDropdownContent.innerHTML = '<div class="p-3 text-gray-500 text-sm">No active chat threads.</div>';
        return;
    }

    const chatItems = window.APP_STATE.chats.map(chat => {
    const isUnread = chat.unreadAdmin;
    const isResolved = chat.status === 'resolved';
    const lastMsgTime = new Date(chat.lastMessageAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    
    return `
        <button onclick="window.openAdminChatModal('${chat.id}'); window.toggleAdminChatDropdown();" class="flex items-center gap-3 p-3 w-full text-left border-b hover:bg-gray-50 transition ${isUnread ? 'bg-lime-50' : ''} ${isResolved ? 'opacity-60' : ''}">
            <div class="flex-grow min-w-0">
                <div class="font-semibold text-gray-800 truncate ${isUnread ? 'font-extrabold text-lime-700' : ''}">
                    ${chat.customerName || chat.id}
                    ${isUnread ? '<span class="text-xs text-red-500 ml-2">NEW</span>' : ''}
                    ${isResolved ? '<span class="text-xs text-gray-500 ml-2">✓ RESOLVED</span>' : ''}
                </div>
                <p class="text-sm text-gray-500 truncate">${chat.lastMessageText || 'No messages yet.'}</p>
            </div>
            <div class="flex-shrink-0 text-xs text-gray-400">
                ${lastMsgTime}
            </div>
        </button>
    `;
}).join('');

    chatDropdownContent.innerHTML = chatItems;
    lucide.createIcons();
};

// Toggle Admin Chat Dropdown
window.toggleAdminChatDropdown = function() {
    const dropdown = document.getElementById('admin-chat-dropdown');
    if (!dropdown) {
        console.error('Admin chat dropdown not found');
        return;
    }
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
        window.renderAdminChatDropdown();
    }
};

function setupRealtimeListeners() {
    console.log('🎧 Setting up real-time listeners...');

    // ✅ PRODUCTS LISTENER
    // ✅ PRODUCTS LISTENER
// ✅ PRODUCTS LISTENER - IMPROVED
onValue(dbRefs.products, (snapshot) => {
    console.log('📦 Products listener triggered');
    
    const oldProducts = window.APP_STATE.products;
    
    if (snapshot.exists()) {
        const productsData = snapshot.val();
        window.APP_STATE.products = Object.values(productsData);
        console.log('✅ Products updated:', window.APP_STATE.products.length);
        
        // Check if products actually changed
        const hasChanged = JSON.stringify(oldProducts) !== JSON.stringify(window.APP_STATE.products);
        
        if (hasChanged) {
            // Re-render if on shop view OR admin dashboard
            if (window.APP_STATE.view === 'shop') {
                renderMain();
            } else if (window.APP_STATE.view === 'admin' && window.APP_STATE.currentUser?.role === 'admin') {
                renderMain();
            }
        }
    } else {
        console.log('⚠️ No products in database');
        window.APP_STATE.products = [];
        
        if (window.APP_STATE.view === 'shop' || 
            (window.APP_STATE.view === 'admin' && window.APP_STATE.currentUser?.role === 'admin')) {
            renderMain();
        }
    }
}, (error) => {
    console.error('❌ Products listener error:', error);
});

    onValue(dbRefs.orders, (snapshot) => {
    console.log('📋 Orders listener triggered');
    
    const oldOrders = JSON.stringify(window.APP_STATE.orders);
    
    if (snapshot.exists()) {
        const ordersData = snapshot.val();
        window.APP_STATE.orders = Object.values(ordersData);
        console.log('✅ Orders updated:', window.APP_STATE.orders.length);
        
        // Only re-render if orders actually changed
        const hasChanged = oldOrders !== JSON.stringify(window.APP_STATE.orders);
        
        if (hasChanged) {
            if (window.APP_STATE.view === 'orders') {
                renderMain();
            } else if (window.APP_STATE.view === 'admin' && window.APP_STATE.currentUser?.role === 'admin') {
                // Update only order tables, not entire page
                updateAdminOrderTablesOnly();
            }
        }
    } else {
        window.APP_STATE.orders = [];
    }
}, (error) => {
    console.error('❌ Orders listener error:', error);
});

    // ✅ CHATS LISTENER
    onValue(dbRefs.chats, (snapshot) => {
        console.log('💬 Chats listener triggered');
        if (snapshot.exists()) {
            const chatsData = snapshot.val();
            window.APP_STATE.chats = Object.keys(chatsData).map(chatId => ({
                id: chatId,
                ...chatsData[chatId]
            })).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
            
            console.log('✅ Chats updated:', window.APP_STATE.chats.length);
            
            // Update UI elements
            if (typeof window.renderAdminChatDropdown === 'function') {
                window.renderAdminChatDropdown();
            }
            if (typeof window.renderChatBubbleIndicator === 'function') {
                window.renderChatBubbleIndicator();
            }
            
            // Update chat windows if open
            const chatWindow = document.getElementById('customer-chat-window');
            if (chatWindow && !chatWindow.classList.contains('hidden')) {
                if (typeof window.updateCustomerChatMessages === 'function') {
                    window.updateCustomerChatMessages();
                }
            }
            
            const modalOverlay = document.getElementById('modal-overlay');
            if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
                const openChatId = modalOverlay.getAttribute('data-chat-id');
                if (openChatId && typeof window.updateAdminChatMessages === 'function') {
                    window.updateAdminChatMessages(openChatId);
                }
            }
        } else {
            console.log('⚠️ No chats in database');
            window.APP_STATE.chats = [];
        }
    }, (error) => {
        console.error('❌ Chats listener error:', error);
    });

    console.log('✅ All listeners set up successfully');
}

// ✅ NEW: Update admin order tables without full page re-render
window.updateAdminOrderTablesOnly = function() {
    // Only proceed if we're on admin view
    if (window.APP_STATE.view !== 'admin') return;
    
    // Update regular orders
    const regularOrders = window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order');
    const filteredRegular = filterOrders(regularOrders, window.APP_STATE.orderSearchQuery || '');
    updateOrderTableDisplay(filteredRegular, 'regular');
    
    // Update pre-orders
    const preOrders = window.APP_STATE.orders.filter(o => o.type === 'pre-order');
    const filteredPreorder = filterOrders(preOrders, window.APP_STATE.preorderSearchQuery || '');
    updateOrderTableDisplay(filteredPreorder, 'preorder');
    
    console.log('✅ Admin order tables updated without full re-render');
};
// ✅ NEW: Real-time update for customer chat messages
// ✅ NEW: Real-time update for customer chat messages
window.updateCustomerChatMessages = function() {
    console.log('🔄 Updating customer chat messages...');
    const chatWindow = document.getElementById('customer-chat-window');
    
    if (!chatWindow || chatWindow.classList.contains('hidden')) {
        console.log('⏭️ Chat window not open, skipping update');
        return;
    }
    
    const threadId = window.getChatThreadId();
    const thread = window.APP_STATE.chats.find(c => c.id === threadId || c.customerUid === threadId);
    
    if (!thread) {
        console.log('⚠️ No thread found for:', threadId);
        return;
    }
    
    console.log('📊 Thread data:', thread);
    
    const messagesContainer = document.getElementById(`chat-messages-${threadId}`);
    if (!messagesContainer) {
        console.log('⚠️ Messages container not found');
        return;
    }
    
    const messages = thread.messages ? Object.values(thread.messages) : [];
    console.log('📬 Total messages:', messages.length);
    
    const senderName = window.APP_STATE.currentUser ? window.APP_STATE.currentUser.name : 'Guest';
    const isScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
    
    const messagesHtml = messages.map(msg => {
    const isCustomer = msg.role === 'customer';
    const isAutoResponse = msg.isAutoResponse || false;
    
    const msgClass = isCustomer 
        ? 'bg-lime-600 text-white self-end rounded-br-none' 
        : (isAutoResponse 
            ? 'bg-blue-50 text-gray-800 self-start rounded-tl-none border border-blue-200' 
            : 'bg-gray-200 text-gray-800 self-start rounded-tl-none');
    
    const nameText = isCustomer ? senderName : (isAutoResponse ? 'Admin (Auto) 🤖' : 'Admin');
    
    // ✅ FIXED: Proper line break handling for all messages
    const formattedText = isAutoResponse 
        ? `<pre class="chat-message-text">${escapeHtml(msg.text)}</pre>`
        : `<div class="chat-message-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`;
    
    return `
        <div class="chat-message-item ${isCustomer ? 'items-end' : 'items-start'} mb-3">
            <div class="text-xs ${isAutoResponse ? 'text-blue-600 font-semibold' : 'text-gray-500'} mb-1">
                ${nameText} - ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div class="${msgClass} chat-message-bubble">
                ${formattedText}
            </div>
        </div>
    `;
}).join('');
    
    messagesContainer.innerHTML = messagesHtml.length > 0 ? messagesHtml : '<div class="text-center text-gray-500 p-5">Start a conversation!</div>';
    
    if (isScrolledToBottom) {
        setTimeout(() => window.scrollToChatBottom(threadId), 50);
    }
    
    if (thread.unreadCustomer) {
        window.markChatAsRead(threadId, 'customer');
    }
    
    console.log('✅ Chat messages updated');
};

window.updateAdminChatMessages = function(threadId) {
    const messagesContainer = document.getElementById(`chat-messages-${threadId}`);
    if (!messagesContainer) return;
    
    const thread = window.APP_STATE.chats.find(c => c.id === threadId);
    if (!thread) return;
    
    const messages = thread.messages ? Object.values(thread.messages) : [];
    const isScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
    
    const messagesHtml = messages.map(msg => {
    const isAdmin = msg.role === 'admin';
    const isAutoResponse = msg.isAutoResponse || false;
    
    const msgClass = isAdmin 
        ? (isAutoResponse 
            ? 'bg-blue-50 text-gray-800 self-end rounded-br-none border border-blue-200' 
            : 'bg-lime-600 text-white self-end rounded-br-none')
        : 'bg-gray-200 text-gray-800 self-start rounded-tl-none';
    
    const nameText = isAdmin ? (isAutoResponse ? 'Admin (Auto) 🤖' : 'Admin') : thread.customerName;
    
    // ✅ FIXED: Proper line break handling for all messages
    const formattedText = isAutoResponse 
        ? `<pre class="chat-message-text">${escapeHtml(msg.text)}</pre>`
        : `<div class="chat-message-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`;
    
    return `
        <div class="chat-message-item ${isAdmin ? 'items-end' : 'items-start'} mb-3">
            <div class="text-xs ${isAutoResponse ? 'text-blue-600 font-semibold' : 'text-gray-500'} mb-1">${nameText} - ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="${msgClass} chat-message-bubble">
                ${formattedText}
            </div>
        </div>
    `;
}).join('');
    
    messagesContainer.innerHTML = messagesHtml.length > 0 ? messagesHtml : '<div class="text-center text-gray-500 p-5">Start a conversation!</div>';
    
    if (isScrolledToBottom) {
        setTimeout(() => window.scrollToChatBottom(threadId), 50);
    }
};

// Global function declarations
window.signupUser = async function() {
    const name = document.getElementById('signup-name')?.value?.trim();
    const email = document.getElementById('signup-email')?.value?.trim()?.toLowerCase();
    const password = document.getElementById('signup-password')?.value;
    const contact = document.getElementById('signup-contact')?.value?.trim() || '';

    if (!name || !email || !password) {
        return showModal('Missing fields', 'Please fill all required signup fields.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const verificationCode = generateVerificationCode();
        const codeExpiry = Date.now() + (15 * 60 * 1000);

        const userData = {
            uid: user.uid,
            email: email,
            name: name,
            contact: contact,
            role: 'customer',
            createdAt: new Date().toISOString(),
            emailVerified: false,
            verificationCode: verificationCode,
            verificationCodeExpiry: codeExpiry
        };
        await saveToFirebase(`users/${user.uid}`, userData);

        await sendVerificationCodeEmail(email, name, verificationCode);
await signOut(auth); // ✅ IMPORTANT: Sign out immediately after signup

hideModal();

// ✅ Show success message FIRST, then verification modal
showModal(
    '✅ Account Created!',
    `
    <div class="text-center space-y-3">
        <div class="text-5xl">📧</div>
        <p class="text-gray-700">Welcome, <b>${name}</b>!</p>
        <p class="text-sm text-gray-600">A verification code has been sent to:</p>
        <p class="font-semibold text-lime-700">${email}</p>
        <p class="text-xs text-gray-500 mt-2">Please verify your email to complete registration</p>
    </div>
    `,
    `<button onclick="hideModal(); showVerificationModal('${email}', '${password}')" class="px-4 py-2 bg-lime-600 text-white rounded">✅ Verify Email Now</button>`
);


    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'An error occurred during signup.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please try logging in.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.message.includes('email')) {
            errorMessage = 'Failed to send verification email. Please check the email address and try again.';
        }

        showModal('Signup Error', errorMessage, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.loginUser = async function() {
    const email = document.getElementById('login-email')?.value?.trim()?.toLowerCase();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        return showModal(
            'Missing fields',
            'Please fill both email and password.',
            `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`
        );
    }

    try {
        // ✅ STEP 1: Sign in to Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // ✅ STEP 2: Get user data from database
        const userData = await getFromFirebase(`users/${user.uid}`);

        if (!userData) {
            await signOut(auth);
            return showModal('Error', 'User data not found.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
        }

        // ✅ STEP 3: CHECK EMAIL VERIFICATION STATUS
        if (!userData.emailVerified) {
            await signOut(auth);
            
            // Check if verification code is expired
            const now = Date.now();
            const isExpired = !userData.verificationCodeExpiry || now > userData.verificationCodeExpiry;
            
            if (isExpired) {
                // Generate new code if expired
                const newVerificationCode = generateVerificationCode();
                const newCodeExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes
                
                await updateFirebase(`users/${user.uid}`, {
                    verificationCode: newVerificationCode,
                    verificationCodeExpiry: newCodeExpiry
                });
                
                // Send new verification email
                await sendVerificationCodeEmail(email, userData.name, newVerificationCode);
                
                return showModal(
                    '📧 Email Not Verified',
                    `
                    <div class="space-y-3">
                        <div class="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500">
                            <p class="text-yellow-800 font-semibold">⚠️ Your email is not verified yet</p>
                        </div>
                        <p class="text-gray-700">A new verification code has been sent to:</p>
                        <p class="font-semibold text-lime-700">${email}</p>
                        <p class="text-sm text-gray-600">Please check your inbox and enter the 6-digit code to verify your account.</p>
                        <p class="text-xs text-gray-500">Code expires in 15 minutes</p>
                    </div>
                    `,
                    `<button onclick="hideModal(); showVerificationModal('${email}', '${password}')" class="px-4 py-2 bg-lime-600 text-white rounded">✅ Enter Verification Code</button>
                     <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>`
                );
            } else {
                // Code still valid
                return showModal(
                    '📧 Email Not Verified',
                    `
                    <div class="space-y-3">
                        <div class="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500">
                            <p class="text-yellow-800 font-semibold">⚠️ Your email is not verified yet</p>
                        </div>
                        <p class="text-gray-700">Please verify your email before logging in.</p>
                        <p class="text-sm text-gray-600">Check your inbox for the 6-digit verification code sent to:</p>
                        <p class="font-semibold text-lime-700">${email}</p>
                    </div>
                    `,
                    `<button onclick="hideModal(); showVerificationModal('${email}', '${password}')" class="px-4 py-2 bg-lime-600 text-white rounded">✅ Enter Verification Code</button>
                     <button onclick="resendVerificationCode('${email}', '${password}')" class="px-4 py-2 bg-blue-600 text-white rounded">📧 Resend Code</button>
                     <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>`
                );
            }
        }

        // ✅ STEP 4: If verified, proceed with login
        window.APP_STATE.currentUser = {
            uid: user.uid,
            email: user.email,
            name: userData.name,
            role: userData.role,
        };

        const userCart = await getFromFirebase(`carts/${user.uid}`);
        if (userCart) {
            window.APP_STATE.cart = Object.values(userCart);
        }

        hideModal();
        updateAuthArea();
        renderMain();

        showModal(
            '✅ Logged in',
            `Welcome back, <b>${window.APP_STATE.currentUser.name}</b>!`,
            `<button onclick="hideModal(); renderMain()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`
        );

    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Invalid email or password.';

        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password. Please check your credentials.';
        }

        showModal(
            'Login Error',
            errorMessage,
            `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`
        );
    }
};

// ✅ NEW: Verify and restore cart stock reservations on login
window.verifyCartStockOnLogin = async function(userId) {
    console.log('🔍 Verifying cart stock reservations...');
    
    const userCart = await getFromFirebase(`carts/${userId}`);
    if (!userCart || Object.keys(userCart).length === 0) {
        console.log('✅ No cart items to verify');
        return;
    }
    
    const cartItems = Object.values(userCart);
    const updatedCart = [];
    
    for (const item of cartItems) {
        if (item.preordered) {
            updatedCart.push(item);
            continue;
        }
        
        const product = await getFromFirebase(`products/${item.productId}`);
        if (!product) {
            console.log(`⚠️ Product ${item.name} no longer exists, removing from cart`);
            continue;
        }
        
        // Check if stock is still sufficient
        if (item.quantity <= product.quantity + item.quantity) {
            updatedCart.push(item);
            console.log(`✅ Cart item verified: ${item.name} (${item.quantity} ${item.unit})`);
        } else {
            // Stock insufficient, restore what was reserved and remove from cart
            const newStock = product.quantity + item.quantity;
            await updateFirebase(`products/${item.productId}`, { quantity: newStock });
            console.log(`⚠️ Insufficient stock for ${item.name}, removed from cart and stock restored`);
        }
    }
    
    // Save verified cart
    await saveToFirebase(`carts/${userId}`, updatedCart);
    window.APP_STATE.cart = updatedCart;
    
    console.log('✅ Cart verification complete');
};

window.logoutUser = async function() {
    try {
        if (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'customer') {
            // Save cart before logout
            await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
        }
        
        // ✅ Clear abandoned cart timer
        if (cartActivityTimer) {
            clearTimeout(cartActivityTimer);
            cartActivityTimer = null;
        }
        
        await signOut(auth);
        window.APP_STATE.currentUser = null;
        window.APP_STATE.cart = [];
        
        updateAuthArea();
        renderMain();
        showModal('Logged out', 'You have been logged out.', `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } catch (error) {
        console.error('Logout error:', error);
    }
};


window.addToCart = async function(productId, qty = 1) {
    const p = window.APP_STATE.products.find(x => x.id === productId);
    if (!p) return showModal('Error', 'Product not found', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);

    if (!window.APP_STATE.currentUser) return showModal('Login required', 'Please log in or create an account to add items to your cart.', `<button onclick="hideModal(); openAuth('login')" class="px-4 py-2 bg-lime-600 text-white rounded">Log in</button><button onclick="hideModal(); openAuth('signup')" class="px-4 py-2 bg-white border rounded">Sign up</button>`);

    if (p.preorder) return showModal('Pre-Order Item', `${p.name} is currently on pre-order. Use the Pre-Order button to reserve it.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    
    // ✅ Get current available stock from Firebase (real-time check)
    const currentProductData = await getFromFirebase(`products/${productId}`);
    if (!currentProductData) {
        return showModal('Error', 'Product not found in database', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);
    }
    
    const availableStock = currentProductData.quantity || 0;
    
    // ✅ Check available stock (real-time)
    if (availableStock <= 0) {
        return showModal('Out of stock', `${p.name} is currently out of stock.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);
    }

    const idx = window.APP_STATE.cart.findIndex(c => c.productId === productId && !c.preordered);
    const currentQtyInCart = idx >= 0 ? window.APP_STATE.cart[idx].quantity : 0;
    const newTotalQty = currentQtyInCart + qty;
    
    // ✅ Check if adding this quantity exceeds available stock (real-time)
    if (newTotalQty > availableStock) {
        return showModal('Not enough stock', `Only ${availableStock} ${p.unit}${availableStock > 1 ? 's' : ''} available. You already have ${currentQtyInCart} in your cart.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);
    }
    
    // ✅ Check order limit
    if(p.orderLimit && newTotalQty > p.orderLimit) {
        return showModal('Order Limit Exceeded', `Maximum order quantity for ${p.name} is ${p.orderLimit} ${p.unit}${p.orderLimit > 1 ? 's' : ''} per customer. You already have ${currentQtyInCart} in your cart.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    // ✅ RESERVE STOCK: Decrease stock immediately when adding to cart
    const newStock = availableStock - qty;
    
    try {
        // Update stock in Firebase
        await updateFirebase(`products/${productId}`, { quantity: newStock });
        
        // Update local state
        p.quantity = newStock;
        
        console.log(`✅ Stock reserved: ${p.name} (${qty} ${p.unit}) - Remaining: ${newStock}`);
        
        // ✅ Add to cart
        if (idx >= 0) {
            window.APP_STATE.cart[idx].quantity += qty;
        } else {
            window.APP_STATE.cart.push({ 
                productId: p.id, 
                name: p.name, 
                price: p.price, 
                quantity: qty, 
                unit: p.unit, 
                preordered: false 
            });
        }

        // ✅ Save cart to Firebase
        await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);

        renderCartDrawer();
        toggleCartDrawer(true);

        await updateCartActivity();
        
    } catch (error) {
        console.error('❌ Error reserving stock:', error);
        showModal('Error', 'Failed to add item to cart. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.preOrderItem = async function(productId, qty = 1) {
    const p = window.APP_STATE.products.find(x=> x.id === productId);
    if(!p) return showModal('Error', 'Product not found', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);
    if(!p.preorder) return showModal('Not pre-order', 'This product is not marked as pre-order.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    if(!window.APP_STATE.currentUser) return showModal('Login required', 'Please log in or create an account to pre-order.', `<button onclick="hideModal(); openAuth('login')" class="px-4 py-2 bg-lime-600 text-white rounded">Log in</button>`);

    const idx = window.APP_STATE.cart.findIndex(c => c.productId === productId && c.preordered === true);
    if(idx >= 0){
        window.APP_STATE.cart[idx].quantity += qty;
    } else {
        window.APP_STATE.cart.push({ productId: p.id, name: p.name, price: p.price, quantity: qty, unit: p.unit, preordered: true });
    }
    await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
    renderCartDrawer();
    toggleCartDrawer(true);
};

window.changeCartItem = async function(pid, newQty) {
    const idx = window.APP_STATE.cart.findIndex(c=> c.productId === pid);
    if(idx === -1) return;
    
    // Ensure quantity is at least 1
    newQty = Math.max(1, parseInt(newQty) || 1);
    
    if(newQty <= 0) return removeCartItem(pid);
    
    const oldQty = window.APP_STATE.cart[idx].quantity;
    const product = window.APP_STATE.products.find(p=> p.id === pid);
    
    if(!product) return;
    
    // ✅ Get current stock from Firebase (real-time check)
    const currentProductData = await getFromFirebase(`products/${pid}`);
    if (!currentProductData) {
        return showModal('Error', 'Product not found in database', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    const currentStock = currentProductData.quantity || 0;
    const qtyDifference = newQty - oldQty;
    
    // ✅ If increasing quantity, check if enough stock available
    if (qtyDifference > 0) {
        if (qtyDifference > currentStock) {
            return showModal('Not enough stock', `Only ${currentStock} ${product.unit}${currentStock > 1 ? 's' : ''} more available in stock.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
        }
    }
    
    // ✅ Check order limit
    if(product.orderLimit && newQty > product.orderLimit) {
        return showModal('Order Limit Exceeded', `Maximum order quantity for ${product.name} is ${product.orderLimit} ${product.unit}${product.orderLimit > 1 ? 's' : ''} per customer.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    try {
        // ✅ UPDATE STOCK: Adjust stock based on quantity change
        const newStock = currentStock - qtyDifference;
        
        // Update stock in Firebase
        await updateFirebase(`products/${pid}`, { quantity: newStock });
        
        // Update local state
        product.quantity = newStock;
        
        console.log(`✅ Stock adjusted: ${product.name} (${qtyDifference > 0 ? '-' : '+'}${Math.abs(qtyDifference)} ${product.unit}) - New stock: ${newStock}`);
        
        // ✅ Update cart quantity
        window.APP_STATE.cart[idx].quantity = newQty;
        
        // ✅ Save cart
        await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
        
        renderCartDrawer();
        renderMain();

        await updateCartActivity();
        
    } catch (error) {
        console.error('❌ Error adjusting stock:', error);
        showModal('Error', 'Failed to update quantity. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.removeCartItem = async function(pid) {
    const idx = window.APP_STATE.cart.findIndex(c=> c.productId === pid);
    if(idx === -1) return;
    
    const cartItem = window.APP_STATE.cart[idx];
    const product = window.APP_STATE.products.find(p => p.id === pid);
    
    if (!product) {
        console.warn('Product not found, removing from cart anyway');
        window.APP_STATE.cart.splice(idx, 1);
        await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
        renderCartDrawer();
        renderMain();
        
        await updateCartActivity();

        return;
    }
    
    // ✅ RESTORE STOCK: Add quantity back to product stock
    const restoredStock = product.quantity + cartItem.quantity;
    
    try {
        // Update stock in Firebase
        await updateFirebase(`products/${pid}`, { quantity: restoredStock });
        
        // Update local state
        product.quantity = restoredStock;
        
        console.log(`✅ Stock restored: ${product.name} (${cartItem.quantity} ${product.unit}) - New stock: ${restoredStock}`);
        
        // Remove from cart
        window.APP_STATE.cart.splice(idx, 1);
        
        // Save updated cart
        await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
        
        renderCartDrawer();
        renderMain();
        
    } catch (error) {
        console.error('❌ Error restoring stock:', error);
        showModal('Error', 'Failed to remove item. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.checkout = async function() {
    if(window.APP_STATE.cart.length === 0) {
        return showModal('Cart is empty', 'Please add items to your cart first.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    if(!window.APP_STATE.currentUser){
        return showModal('Login required', 'Please log in or create an account to place your order.', `<button onclick="hideModal(); openAuth('login')" class="px-4 py-2 bg-lime-600 text-white rounded">Log in</button><button onclick="hideModal(); openAuth('signup')" class="px-4 py-2 bg-white border rounded">Sign up</button>`);
    }

    // ✅ NEW: Validate stock availability before showing checkout form
    console.log('🔍 Validating stock availability...');
    const unavailableItems = [];
    
    for (const cartItem of window.APP_STATE.cart) {
        if (cartItem.preordered) continue; // Skip pre-order items
        
        const product = window.APP_STATE.products.find(p => p.id === cartItem.productId);
        if (!product) {
            unavailableItems.push(`${cartItem.name} - Product no longer available`);
            continue;
        }
        
        if (product.quantity < cartItem.quantity) {
            unavailableItems.push(`${cartItem.name} - Only ${product.quantity} ${product.unit}${product.quantity > 1 ? 's' : ''} available (you have ${cartItem.quantity} in cart)`);
        }
    }
    
    if (unavailableItems.length > 0) {
        return showModal(
            '⚠️ Stock Unavailable', 
            `
            <div class="space-y-3">
                <p class="text-gray-700">Some items in your cart are no longer available or have insufficient stock:</p>
                <ul class="list-disc pl-5 space-y-1 text-sm text-red-600">
                    ${unavailableItems.map(item => `<li>${item}</li>`).join('')}
                </ul>
                <p class="text-sm text-gray-600">Please remove these items or reduce quantities before checking out.</p>
            </div>
            `, 
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">Update Cart</button>`
        );
    }

    // ✅ NEW: Check if user has completed profile
    const userData = await getFromFirebase(`users/${window.APP_STATE.currentUser.uid}`);
    const profile = userData.profile || {};
    
    // ✅ NEW: Check if profile is denied
    if(profile.denied) {
        return showModal('Profile Verification Denied', `
            <div class="space-y-3">
                <div class="bg-red-50 p-3 rounded-lg border-l-4 border-red-500">
                    <div class="flex items-center gap-2 text-red-800 mb-2">
                        <i data-lucide="x-circle" class="w-5 h-5"></i>
                        <span class="font-semibold">Your profile verification was denied</span>
                    </div>
                    <div class="bg-white p-2 rounded border border-red-200">
                        <div class="text-xs text-red-700 font-semibold mb-1">Reason:</div>
                        <div class="text-sm text-red-900">${profile.denialReason || 'No reason provided'}</div>
                    </div>
                </div>
                <p class="text-gray-700">Please update your profile information and resubmit for verification before you can place orders.</p>
            </div>
        `, `<button onclick="hideModal(); showUserProfile();" class="px-4 py-2 bg-lime-600 text-white rounded">Update Profile</button>
            <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>`);
    }
    
    if(!profile.fullName || !profile.idUrl) {
        return showModal('Complete Your Profile', `
            <div class="space-y-3">
                <p class="text-gray-700">Please complete your profile with valid ID before placing an order.</p>
                <p class="text-sm text-gray-600">This is required for verification and delivery purposes.</p>
            </div>
        `, `<button onclick="hideModal(); showUserProfile();" class="px-4 py-2 bg-lime-600 text-white rounded">Complete Profile</button>
            <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>`);
    }

    // ✅ NEW: Check if profile is still pending verification
    if(!profile.verified) {
        return showModal('Profile Pending Verification', `
            <div class="space-y-3">
                <div class="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500">
                    <div class="flex items-center gap-2 text-yellow-800">
                        <i data-lucide="clock" class="w-5 h-5"></i>
                        <span class="font-semibold">Your profile is pending verification</span>
                    </div>
                </div>
                <p class="text-gray-700">An admin is reviewing your profile information.</p>
                <p class="text-sm text-gray-600">You'll be able to place orders once your profile is verified.</p>
            </div>
        `, `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    }
    
    // ... rest of the checkout function continues as normal
    const subtotal = window.APP_STATE.cart.reduce((s,i)=> s + i.price * i.quantity, 0);
    const deliveryFee = window.APP_STATE.deliveryFee || 25.00;
    const total = subtotal + deliveryFee;

    const barangayOptions = CAINTA_BARANGAYS.map(brgy => 
        `<option value="${brgy}" ${profile.barangay === brgy ? 'selected' : ''}>${brgy}</option>`
    ).join('');

    showModal('Checkout', `
        <form id="checkout-form" class="grid gap-3" onsubmit="event.preventDefault(); validateAndPlaceOrder();">
          <div class="bg-lime-50 p-3 rounded-lg border border-lime-200 mb-2">
            <div class="flex items-center gap-2 text-sm text-lime-800">
              <i data-lucide="map-pin" class="w-4 h-4"></i>
              <span class="font-semibold">Delivery within Cainta, Rizal only</span>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name <span class="text-red-600">*</span></label>
            <input id="customer-name" placeholder="Full Name" value="${profile.fullName || window.APP_STATE.currentUser.name || ''}" class="p-2 border rounded w-full" required />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Number <span class="text-red-600">*</span></label>
            <input id="customer-contact" placeholder="Contact Number (09XXXXXXXXX)" type="tel" pattern="09[0-9]{9}" value="${userData.contact || ''}" class="p-2 border rounded w-full" required />
            <div class="text-xs text-gray-500 mt-1">Format: 09XXXXXXXXX (11 digits)</div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
            
            <input id="customer-unit" placeholder="Unit/House Number (e.g., Unit 101, House 25)" value="${profile.unit || ''}" class="p-2 border rounded w-full mb-2" required />
            
            <input id="customer-building" placeholder="Building Name (optional)" value="${profile.building || ''}" class="p-2 border rounded w-full mb-2" />
            
            <input id="customer-street" placeholder="Street Name (e.g., Ortigas Avenue Extension)" value="${profile.street || ''}" class="p-2 border rounded w-full mb-2" required />
            
            <select id="customer-barangay" class="p-2 border rounded w-full mb-2" required>
              <option value="">Select Barangay</option>
              ${barangayOptions}
            </select>
            
            <div class="text-xs bg-lime-50 text-lime-800 p-2 rounded border border-lime-200">
              <i data-lucide="map-pin" class="w-3 h-3 inline"></i> 
              <strong>Delivery to:</strong><br>
              <span id="checkout-address-preview">[Unit], [Building], [Street], Brgy. [Barangay], Cainta, Rizal</span>
            </div>
            <div id="address-error" class="text-xs text-red-600 mt-1 hidden font-semibold"></div>
          </div>

          <div class="bg-gray-50 p-3 rounded-lg space-y-1">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Subtotal:</span>
              <span class="font-semibold">${formatPeso(subtotal)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Delivery Fee:</span>
              <span class="font-semibold">${formatPeso(deliveryFee)}</span>
            </div>
            <div class="border-t pt-1 mt-1"></div>
            <div class="flex justify-between">
              <span class="text-gray-700 font-semibold">Total:</span>
              <span class="font-bold text-lime-700">${formatPeso(total)}</span>
            </div>
          </div>
        </form>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button type="button" onclick="validateAndPlaceOrder()" class="px-4 py-2 bg-lime-600 text-white rounded hover:bg-lime-700">Place Order</button>`);
    
    setTimeout(() => {
        icons();
        
        // Add event listeners for checkout address preview
        const checkoutAddressFields = ['customer-unit', 'customer-building', 'customer-street', 'customer-barangay'];
        checkoutAddressFields.forEach(fieldId => {
            document.getElementById(fieldId)?.addEventListener('input', updateCheckoutAddressPreview);
            document.getElementById(fieldId)?.addEventListener('change', updateCheckoutAddressPreview);
        });

        // Initial preview update
        updateCheckoutAddressPreview();
    }, 100);
};

// ✅ NEW: Clean up abandoned carts after 30 minutes
window.cleanupAbandonedCart = async function(userId) {
    const CART_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const lastActivity = localStorage.getItem(`cart_activity_${userId}`);
    
    if (!lastActivity) return;
    
    const timeSinceActivity = Date.now() - parseInt(lastActivity);
    
    if (timeSinceActivity > CART_TIMEOUT) {
        console.log('🧹 Cleaning up abandoned cart...');
        
        const cart = await getFromFirebase(`carts/${userId}`);
        if (!cart) return;
        
        // Restore stock for all cart items
        const cartItems = Object.values(cart);
        for (const item of cartItems) {
            if (item.preordered) continue;
            
            const product = await getFromFirebase(`products/${item.productId}`);
            if (product) {
                const restoredStock = product.quantity + item.quantity;
                await updateFirebase(`products/${item.productId}`, { quantity: restoredStock });
                console.log(`✅ Stock restored from abandoned cart: ${item.name} (+${item.quantity})`);
            }
        }
        
        // Clear cart
        await saveToFirebase(`carts/${userId}`, []);
        console.log('✅ Abandoned cart cleaned up');
    }
};

// ✅ Track cart activity with timestamp in Firebase
window.updateCartActivity = async function() {
    if (!window.APP_STATE.currentUser) return;
    
    const timestamp = Date.now();
    
    try {
        // Save activity timestamp to Firebase
        await updateFirebase(`carts/${window.APP_STATE.currentUser.uid}`, {
            lastActivity: timestamp
        });
        
        console.log('🕐 Cart activity updated:', new Date(timestamp).toLocaleTimeString());
        
        // Reset the cleanup timer
        resetAbandonedCartTimer();
    } catch (error) {
        console.error('❌ Error updating cart activity:', error);
    }
};

// ✅ Reset the abandoned cart cleanup timer
window.resetAbandonedCartTimer = function() {
    // Clear existing timer
    if (cartActivityTimer) {
        clearTimeout(cartActivityTimer);
    }
    
    // Set new timer for cart timeout
    cartActivityTimer = setTimeout(() => {
        if (window.APP_STATE.currentUser && window.APP_STATE.cart.length > 0) {
            console.log('⏰ Cart timeout reached, cleaning up...');
            cleanupCurrentUserCart();
        }
    }, CART_TIMEOUT);
    
    console.log('⏱️ Cart cleanup timer set for 30 minutes');
};

// ✅ Cleanup current user's cart
window.cleanupCurrentUserCart = async function() {
    if (!window.APP_STATE.currentUser) return;
    
    const userId = window.APP_STATE.currentUser.uid;
    
    console.log('🧹 Cleaning up abandoned cart for user:', userId);
    
    try {
        const cart = window.APP_STATE.cart;
        
        if (cart.length === 0) {
            console.log('✅ No items to clean up');
            return;
        }
        
        // Restore stock for all cart items
        for (const item of cart) {
            if (item.preordered) continue; // Skip pre-order items
            
            const product = window.APP_STATE.products.find(p => p.id === item.productId);
            if (!product) continue;
            
            const restoredStock = product.quantity + item.quantity;
            
            // Update Firebase
            await updateFirebase(`products/${item.productId}`, { quantity: restoredStock });
            
            // Update local state
            product.quantity = restoredStock;
            
            console.log(`✅ Stock restored: ${item.name} (+${item.quantity}) = ${restoredStock} total`);
        }
        
        // Clear cart
        window.APP_STATE.cart = [];
        await saveToFirebase(`carts/${userId}`, { lastActivity: Date.now() });
        
        // Update UI
        renderCartDrawer();
        renderMain();
        
        // Show notification
        showModal('Cart Cleared', 
            `Your cart was automatically cleared due to inactivity. Stock has been restored.`,
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`
        );
        
        console.log('✅ Cart cleanup complete');
        
    } catch (error) {
        console.error('❌ Error cleaning up cart:', error);
    }
};

// ✅ Check for abandoned carts on app initialization
window.checkAbandonedCartOnStartup = async function() {
    if (!window.APP_STATE.currentUser) return;
    
    const userId = window.APP_STATE.currentUser.uid;
    
    try {
        const cartData = await getFromFirebase(`carts/${userId}`);
        
        if (!cartData || !cartData.lastActivity) {
            // No cart data or no activity timestamp, start fresh
            await updateCartActivity();
            return;
        }
        
        const lastActivity = cartData.lastActivity;
        const timeSinceActivity = Date.now() - lastActivity;
        
        console.log('🔍 Checking cart age:', Math.round(timeSinceActivity / 1000 / 60), 'minutes old');
        
        if (timeSinceActivity > CART_TIMEOUT) {
            console.log('⚠️ Found abandoned cart, cleaning up...');
            
            // Cart is abandoned, restore stock
            const cartItems = Object.values(cartData).filter(item => 
                item && typeof item === 'object' && item.productId
            );
            
            for (const item of cartItems) {
                if (item.preordered) continue;
                
                const currentProduct = await getFromFirebase(`products/${item.productId}`);
                if (!currentProduct) continue;
                
                const restoredStock = currentProduct.quantity + item.quantity;
                await updateFirebase(`products/${item.productId}`, { quantity: restoredStock });
                
                console.log(`✅ Stock restored on startup: ${item.name} (+${item.quantity}) = ${restoredStock} total`);
            }
            
            // Clear cart
            window.APP_STATE.cart = [];
            await saveToFirebase(`carts/${userId}`, { lastActivity: Date.now() });
            
            console.log('✅ Abandoned cart cleaned up on startup');
        } else {
            // Cart is still valid, start timer for remaining time
            const remainingTime = CART_TIMEOUT - timeSinceActivity;
            
            console.log('✅ Cart is still active, timer set for', Math.round(remainingTime / 1000 / 60), 'minutes');
            
            cartActivityTimer = setTimeout(() => {
                cleanupCurrentUserCart();
            }, remainingTime);
        }
        
    } catch (error) {
        console.error('❌ Error checking abandoned cart:', error);
    }
};

// ✅ Global cleanup check (runs every 5 minutes for all users)
window.startGlobalAbandonedCartCleanup = function() {
    setInterval(async () => {
        console.log('🌐 Running global abandoned cart check...');
        
        try {
            // Get all carts from Firebase
            const allCarts = await getFromFirebase('carts');
            if (!allCarts) return;
            
            const now = Date.now();
            
            for (const [userId, cartData] of Object.entries(allCarts)) {
                if (!cartData || !cartData.lastActivity) continue;
                
                const timeSinceActivity = now - cartData.lastActivity;
                
                if (timeSinceActivity > CART_TIMEOUT) {
                    console.log(`🧹 Found abandoned cart for user ${userId}, cleaning up...`);
                    
                    const cartItems = Object.values(cartData).filter(item => 
                        item && typeof item === 'object' && item.productId
                    );
                    
                    for (const item of cartItems) {
                        if (item.preordered) continue;
                        
                        const currentProduct = await getFromFirebase(`products/${item.productId}`);
                        if (!currentProduct) continue;
                        
                        const restoredStock = currentProduct.quantity + item.quantity;
                        await updateFirebase(`products/${item.productId}`, { quantity: restoredStock });
                        
                        console.log(`✅ Global cleanup - Stock restored: ${item.name} (+${item.quantity})`);
                    }
                    
                    // Clear abandoned cart
                    await saveToFirebase(`carts/${userId}`, { lastActivity: now });
                    console.log(`✅ Cleared abandoned cart for user ${userId}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Error in global cart cleanup:', error);
        }
    }, 5 * 60 * 1000); // Run every 5 minutes
};

// HTML escape function to prevent XSS
window.escapeHtml = function(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
};

// Auto-resize textarea as user types
window.autoResizeChatInput = function(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
};

// Handle keyboard shortcuts in chat input
window.handleChatInputKeydown = function(event, threadId, senderName, role) {
    // Enter without Shift = Send message
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const sendBtn = document.getElementById(`chat-send-btn-${threadId}`);
        if (sendBtn) sendBtn.click();
    }
    // Shift+Enter = New line (default behavior, no need to handle)
};

// Show user profile modal
window.showUserProfile = async function() {
    if(!window.APP_STATE.currentUser) {
        return showModal('Login Required', 'Please log in to view your profile.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    const userData = await getFromFirebase(`users/${window.APP_STATE.currentUser.uid}`);
    if(!userData) {
        return showModal('Error', 'User data not found.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    const profile = userData.profile || {};
    const hasProfile = profile.fullName && profile.birthday && profile.idType;
    
    const barangayOptions = CAINTA_BARANGAYS.map(brgy => 
        `<option value="${brgy}" ${profile.barangay === brgy ? 'selected' : ''}>${brgy}</option>`
    ).join('');

    const idTypeOptions = VALID_ID_TYPES.map(idType => 
        `<option value="${idType}" ${profile.idType === idType ? 'selected' : ''}>${idType}</option>`
    ).join('');

    showModal('My Profile', `
    <form id="profile-form" class="grid gap-3">
        ${hasProfile ? `
    ${profile.verified ? `
        <div class="bg-green-50 p-3 rounded-lg border border-green-200 mb-2">
            <div class="flex items-center gap-2 text-sm text-green-800">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                <span class="font-semibold">Profile Verified</span>
            </div>
        </div>
    ` : profile.denied ? `
        <div class="bg-red-50 p-3 rounded-lg border border-red-200 mb-2">
            <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-red-800">
                    <i data-lucide="x-circle" class="w-4 h-4"></i>
                    <span class="font-semibold">Profile Verification Denied</span>
                </div>
                <div class="bg-white p-2 rounded border border-red-200">
                    <div class="text-xs text-red-700 font-semibold mb-1">Reason:</div>
                    <div class="text-xs text-red-900">${profile.denialReason || 'No reason provided'}</div>
                </div>
                <div class="text-xs text-red-700">
                    Please update your information and resubmit for verification.
                </div>
            </div>
        </div>
    ` : `
        <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-2">
            <div class="flex items-center gap-2 text-sm text-yellow-800">
                <i data-lucide="clock" class="w-4 h-4"></i>
                <span class="font-semibold">Profile Submitted - Pending Verification</span>
            </div>
        </div>
    `}
` : `
            <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-2">
                <div class="flex items-center gap-2 text-sm text-yellow-800">
                    <i data-lucide="alert-circle" class="w-4 h-4"></i>
                    <span class="font-semibold">Complete your profile to enable checkout</span>
                </div>
            </div>
        `}

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name (as shown on ID) <span class="text-red-600">*</span></label>
            <input id="profile-fullname" type="text" value="${profile.fullName || ''}" placeholder="Juan Dela Cruz" class="p-2 border rounded w-full" required ${profile.verified ? 'disabled' : ''} />
        </div>

        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Birthday <span class="text-red-600">*</span></label>
                <input id="profile-birthday" type="date" value="${profile.birthday || ''}" class="p-2 border rounded w-full" required ${profile.verified ? 'disabled' : ''} />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Age <span class="text-red-600">*</span></label>
                <input id="profile-age" type="number" value="${profile.age || ''}" placeholder="18" min="18" max="120" class="p-2 border rounded w-full" required ${profile.verified ? 'disabled' : ''} />
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Home Address in Cainta, Rizal</label>
            
            <input id="profile-unit" type="text" value="${profile.unit || ''}" placeholder="Unit/House Number (e.g., Unit 101, House 25)" class="p-2 border rounded w-full mb-2" required ${profile.verified ? 'disabled' : ''} />
            
            <input id="profile-building" type="text" value="${profile.building || ''}" placeholder="Building Name (optional)" class="p-2 border rounded w-full mb-2" ${profile.verified ? 'disabled' : ''} />
            
            <input id="profile-street" type="text" value="${profile.street || ''}" placeholder="Street Name (e.g., Ortigas Avenue Extension)" class="p-2 border rounded w-full mb-2" required ${profile.verified ? 'disabled' : ''} />
            
            <select id="profile-barangay" class="p-2 border rounded w-full mb-2" required ${profile.verified ? 'disabled' : ''}>
                <option value="">Select Barangay</option>
                ${barangayOptions}
            </select>
            
            <div class="text-xs bg-lime-50 text-lime-800 p-2 rounded border border-lime-200">
                <i data-lucide="map-pin" class="w-3 h-3 inline"></i> 
                <strong>Your address will be:</strong><br>
                <span id="address-preview">[Unit], [Building], [Street], Brgy. [Barangay], Cainta, Rizal</span>
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ID Type <span class="text-red-600">*</span></label>
            <select id="profile-idtype" class="p-2 border rounded w-full" required ${profile.verified ? 'disabled' : ''}>
                <option value="">Select ID Type</option>
                ${idTypeOptions}
            </select>
        </div>

        ${!profile.verified ? `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Upload Valid ID <span class="text-red-600">*</span></label>
                <input id="profile-id-file" type="file" accept="image/*,.pdf" class="p-2 border rounded w-full" ${profile.idUrl ? '' : 'required'} />
                <div class="text-xs text-gray-500 mt-1">
                    <i data-lucide="info" class="w-3 h-3 inline"></i> Accepted: JPG, PNG, PDF (Max 5MB)
                </div>
                ${profile.idUrl ? `
                    <div class="mt-2 p-2 bg-gray-50 rounded border">
                        <span class="text-xs text-gray-600">Current ID on file</span>
                        <button type="button" onclick="viewUploadedID('${profile.idUrl}')" class="ml-2 text-xs text-blue-600 underline">View</button>
                    </div>
                ` : ''}
            </div>
        ` : `
            <div class="p-3 bg-gray-50 rounded border">
                <div class="text-sm font-medium text-gray-700 mb-2">ID Type: ${profile.idType}</div>
                <div class="text-sm font-medium text-gray-700 mb-2">Uploaded ID</div>
                <button type="button" onclick="viewUploadedID('${profile.idUrl}')" class="text-sm text-blue-600 underline">View ID</button>
            </div>
        `}

        <div id="profile-error" class="text-xs text-red-600 mt-1 hidden font-semibold"></div>
    </form>
`, `
    <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>
    ${!profile.verified ? `<button onclick="saveUserProfile()" class="px-4 py-2 bg-lime-600 text-white rounded">Save Profile</button>` : ''}
`);

    setTimeout(() => icons(), 100);

    // After icons(), add:

// Add event listeners for real-time address preview
if(!profile.verified) {
    const addressFields = ['profile-unit', 'profile-building', 'profile-street', 'profile-barangay'];
    addressFields.forEach(fieldId => {
        document.getElementById(fieldId)?.addEventListener('input', updateAddressPreview);
        document.getElementById(fieldId)?.addEventListener('change', updateAddressPreview);
    });
    
    // Initial preview update
    updateAddressPreview();
}

    // Calculate age when birthday changes
    if(!profile.verified) {
        document.getElementById('profile-birthday')?.addEventListener('change', function() {
            const birthday = new Date(this.value);
            const today = new Date();
            let age = today.getFullYear() - birthday.getFullYear();
            const monthDiff = today.getMonth() - birthday.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
                age--;
            }
            document.getElementById('profile-age').value = age;
        });
    }
};

// View uploaded ID
window.viewUploadedID = function(idUrl) {
    showModal('Valid ID', `
        <div class="flex justify-center">
            ${idUrl.endsWith('.pdf') ? 
                `<embed src="${idUrl}" type="application/pdf" width="100%" height="500px" />` :
                `<img src="${idUrl}" alt="Valid ID" class="max-w-full h-auto rounded border" />`
            }
        </div>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">Close</button>`);
    setTimeout(() => icons(), 100);
};

// Save user profile
// Save user profile
window.saveUserProfile = async function() {
    const fullName = document.getElementById('profile-fullname')?.value?.trim();
    const birthday = document.getElementById('profile-birthday')?.value;
    const age = parseInt(document.getElementById('profile-age')?.value);
    const unit = document.getElementById('profile-unit')?.value?.trim();
    const building = document.getElementById('profile-building')?.value?.trim();
    const street = document.getElementById('profile-street')?.value?.trim();
    const barangay = document.getElementById('profile-barangay')?.value;
    const idType = document.getElementById('profile-idtype')?.value;
    const idFile = document.getElementById('profile-id-file')?.files[0];

    const errorDiv = document.getElementById('profile-error');
    if(errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    // Validation
    if(!fullName || !birthday || !age || !unit || !street || !barangay || !idType) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Please fill all required fields';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if(age < 18) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ You must be at least 18 years old';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Validate barangay is in Cainta
    if(!CAINTA_BARANGAYS.includes(barangay)) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Please select a valid barangay in Cainta';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Check if ID file is provided (for new profiles or updates)
    const userData = await getFromFirebase(`users/${window.APP_STATE.currentUser.uid}`);
    const existingProfile = userData.profile || {};
    
    if(!idFile && !existingProfile.idUrl) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Please upload your valid ID';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    try {
        let idUrl = existingProfile.idUrl || '';

        // Upload ID if new file is provided
        if(idFile) {
            console.log('Uploading ID to Cloudinary...');
            const uploadResult = await cloudinary.uploadImage(idFile);
            idUrl = uploadResult.url;
            console.log('ID uploaded successfully:', idUrl);
        }

        // Format complete address
        const addressParts = [unit];
        if(building) addressParts.push(building);
        addressParts.push(street);
        addressParts.push(`Brgy. ${barangay}`);
        addressParts.push('Cainta, Rizal');
        
        const homeAddress = addressParts.join(', ');

        const profileData = {
            fullName,
            birthday,
            age,
            unit,
            building: building || '',
            street,
            barangay,
            homeAddress,
            idType,
            idUrl,
            verified: false,
            denied: false,  // ✅ Clear denial status
            denialReason: null,  // ✅ Clear denial reason
            deniedAt: null,  // ✅ Clear denial timestamp
            deniedBy: null,  // ✅ Clear who denied it
            submittedAt: new Date().toISOString()
        };

        await updateFirebase(`users/${window.APP_STATE.currentUser.uid}`, {
            profile: profileData
        });

        hideModal();
        showModal('Profile Saved', `
            <div class="text-center space-y-3">
                <div class="text-5xl">✓</div>
                <p class="text-gray-700">Your profile has been submitted for verification.</p>
                <p class="text-sm text-gray-600">An admin will review your information shortly.</p>
                <div class="mt-3 p-3 bg-gray-50 rounded text-left">
                    <div class="text-xs text-gray-600 mb-1">Your registered address:</div>
                    <div class="text-sm font-semibold text-gray-800">${homeAddress}</div>
                </div>
            </div>
        `, `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);

    } catch (error) {
        console.error('Error saving profile:', error);
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Failed to save profile. Please try again.';
            errorDiv.classList.remove('hidden');
        }
    }
};

window.validateCaintaAddress = function(street, barangay) {
    if(!street || street.trim().length === 0) {
        return { valid: false, message: 'Street name is required' };
    }
    
    if(!barangay || barangay.trim().length === 0) {
        return { valid: false, message: 'Please select a barangay' };
    }
    
    // Check if selected barangay is in the valid list
    if(!CAINTA_BARANGAYS.includes(barangay)) {
        return { 
            valid: false, 
            message: 'Please select a valid barangay in Cainta' 
        };
    }
    
    return { valid: true, message: 'Address validated' };
};
// Update address preview in real-time
window.updateAddressPreview = function() {
    const unit = document.getElementById('profile-unit')?.value?.trim() || '[Unit]';
    const building = document.getElementById('profile-building')?.value?.trim();
    const street = document.getElementById('profile-street')?.value?.trim() || '[Street]';
    const barangay = document.getElementById('profile-barangay')?.value || '[Barangay]';
    
    const preview = document.getElementById('address-preview');
    if(preview) {
        const parts = [unit];
        if(building) parts.push(building);
        parts.push(street);
        parts.push(`Brgy. ${barangay}`);
        parts.push('Cainta, Rizal');
        
        preview.textContent = parts.join(', ');
    }
};

// Address validation function for Cainta, Rizal only

// Validate address before placing order

window.validateAndPlaceOrder = async function() {
    const name = document.getElementById('customer-name')?.value?.trim();
    const contact = document.getElementById('customer-contact')?.value?.trim();
    const unit = document.getElementById('customer-unit')?.value?.trim();
    const building = document.getElementById('customer-building')?.value?.trim();
    const street = document.getElementById('customer-street')?.value?.trim();
    const barangay = document.getElementById('customer-barangay')?.value?.trim();
    
    console.log('Validating order:', { name, contact, unit, building, street, barangay });
    
    // Clear previous error
    const errorDiv = document.getElementById('address-error');
    if(errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }
    
    // Check all required fields are filled
    if(!name || !contact || !unit || !street || !barangay) {
        showModal('Missing info', 'Please fill all required checkout fields', `<button onclick="hideModal(); checkout();" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
        return;
    }

    // Validate contact number format
    const phoneRegex = /^09[0-9]{9}$/;
    if(!phoneRegex.test(contact)) {
        showModal('Invalid Contact Number', 'Please enter a valid Philippine mobile number (format: 09XXXXXXXXX)', `<button onclick="hideModal(); checkout();" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
        return;
    }
    
    // Validate barangay is in Cainta
    if(!CAINTA_BARANGAYS.includes(barangay)) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Please select a valid barangay in Cainta';
            errorDiv.classList.remove('hidden');
        }
        return;
    }
    
    // Format the complete address
    const addressParts = [unit];
    if(building) addressParts.push(building);
    addressParts.push(street);
    addressParts.push(`Brgy. ${barangay}`);
    addressParts.push('Cainta, Rizal');
    
    const address = addressParts.join(', ');
    console.log('Formatted address:', address);
    
    // 🆕 GET USER PROFILE DATA
    const userData = await getFromFirebase(`users/${window.APP_STATE.currentUser.uid}`);
    const profile = userData.profile || {};
    
    // Proceed with placing order
    // ✅ FIXED: Generate proper random order ID
const newId = 'O-' + generateOrderId(); // Now generates O-XXXXXXXX with random alphanumeric
    const itemsCopy = window.APP_STATE.cart.map(i=> ({ ...i }));
    const subtotal = itemsCopy.reduce((s,i)=> s + i.price * i.quantity, 0);
    const deliveryFee = window.APP_STATE.deliveryFee || 25.00;
    const total = subtotal + deliveryFee;
    const isPreorderOrder = itemsCopy.some(it => it.preordered === true);
    
    const newOrder = { 
        id: newId, 
        items: itemsCopy, 
        subtotal: subtotal, 
        deliveryFee: deliveryFee, 
        total, 
        status: isPreorderOrder ? 'Pre-Order Received' : 'Preparing Order', 
        type: isPreorderOrder ? 'pre-order' : 'regular', 
        customer: name, 
        email: window.APP_STATE.currentUser.email, 
        contact, 
        address, 
        addressDetails: {
            unit,
            building: building || '',
            street,
            barangay,
            city: 'Cainta',
            province: 'Rizal'
        },
        // 🆕 ADD CUSTOMER PROFILE DATA
        customerProfile: {
            fullName: profile.fullName || name,
            birthday: profile.birthday || '',
            age: profile.age || '',
            idType: profile.idType || '',
            idUrl: profile.idUrl || '',
            verified: profile.verified || false,
            homeAddress: profile.homeAddress || address
        },
        date: new Date().toLocaleString(), 
        userId: window.APP_STATE.currentUser.uid 
    };

    try {
    console.log('💾 Saving order to Firebase...', newOrder);
    
    // ✅ STOCK ALREADY DECREASED IN CART - Just verify and save order
    console.log('📦 Stock already reserved in cart, proceeding with order...');
    
    // ✅ Verify stock availability one final time before confirming order
    for (const item of itemsCopy) {
        if (item.preordered) continue; // Skip pre-order items
        
        const currentProduct = await getFromFirebase(`products/${item.productId}`);
        if (!currentProduct) {
            throw new Error(`Product ${item.name} no longer exists`);
        }
        
        // Stock should already be reserved from cart, just log for verification
        console.log(`✅ Stock verification: ${item.name} - Current stock: ${currentProduct.quantity}`);
    }
    
    // ✅ Save order to Firebase (NO stock decrease needed)
    await saveToFirebase(`orders/${newId}`, newOrder);
    console.log('✅ Order saved successfully');
    
    // ✅ Clear cart (stock already adjusted)
    window.APP_STATE.cart = [];
        await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, { lastActivity: Date.now() });
        console.log('✅ Cart cleared');
        
        // ✅ Clear abandoned cart timer since order is complete
        if (cartActivityTimer) {
            clearTimeout(cartActivityTimer);
            cartActivityTimer = null;
        }

        toggleCartDrawer(false);
        hideModal();
    
    // ... rest of success modal code
        
        showModal('Order Placed! 🎉', `
            <div class="text-center space-y-3">
                <div class="text-5xl text-green-600">✓</div>
                <p class="text-gray-700">Thank you <b>${name}</b>!</p>
                <p class="text-gray-700">Your order <b>${newId}</b> for <b>${formatPeso(total)}</b> has been received.</p>
                <div class="mt-3 p-3 bg-gray-50 rounded text-left">
                    <div class="text-xs text-gray-600 mb-1">Delivery to:</div>
                    <div class="text-sm font-semibold text-gray-800">${address}</div>
                </div>
                <div class="mt-3 p-3 bg-blue-50 rounded text-left border-l-4 border-blue-500">
                    <div class="text-xs text-blue-800 font-semibold mb-1">📞 Contact Number</div>
                    <div class="text-sm text-blue-900">${contact}</div>
                </div>
            </div>
        `, `<button onclick="hideModal(); switchTo('orders'); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">View My Orders</button>`);
        
        renderMain();
    } catch (error) {
        console.error('Error placing order:', error);
        showModal('Error', 'Failed to place order. Please try again.', `<button onclick="hideModal(); checkout();" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Update checkout address preview in real-time
window.updateCheckoutAddressPreview = function() {
    const unit = document.getElementById('customer-unit')?.value?.trim() || '[Unit]';
    const building = document.getElementById('customer-building')?.value?.trim();
    const street = document.getElementById('customer-street')?.value?.trim() || '[Street]';
    const barangay = document.getElementById('customer-barangay')?.value || '[Barangay]';
    
    const preview = document.getElementById('checkout-address-preview');
    if(preview) {
        const parts = [unit];
        if(building) parts.push(building);
        parts.push(street);
        parts.push(`Brgy. ${barangay}`);
        parts.push('Cainta, Rizal');
        
        preview.textContent = parts.join(', ');
    }
};

window.adminAddProduct = function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);

    showModal('Add New Product', `
    <form id="product-form" class="grid gap-3">
    <input id="p-name" placeholder="Product name" class="p-2 border rounded" />
    <textarea id="p-description" placeholder="Product description (optional)" rows="3" class="p-2 border rounded resize-none"></textarea>
    <div class="grid grid-cols-3 gap-2">
        <input id="p-price" type="number" step="0.01" placeholder="Price (₱)" class="p-2 border rounded col-span-1" />
        <input id="p-qty" type="number" placeholder="Quantity" class="p-2 border rounded" />
        <select id="p-unit" class="p-2 border rounded">
            <option value="kg">kg</option>
            <option value="1/2 kg">1/2 kg</option>
            <option value="1/4 kg">1/4 kg</option>
            <option value="pc">pc</option>
            <option value="pack">pack</option>
            <option value="bundle">bundle</option>
        </select>
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Order Limit per Customer (optional)</label>
        <input id="p-order-limit" type="number" min="1" placeholder="e.g., 5 (leave empty for no limit)" class="p-2 border rounded w-full" />
        <div class="text-xs text-gray-500 mt-1">Maximum quantity a customer can order at once</div>
    </div>
    <input id="p-origin" placeholder="Origin (Farm name)" class="p-2 border rounded" />
    <div class="grid grid-cols-2 gap-2">
        <input id="p-farmer" placeholder="Farmer name" class="p-2 border rounded" />
        <input id="p-contact" placeholder="Farmer contact" class="p-2 border rounded" />
    </div>
    <div class="flex items-center gap-3">
        <input id="p-img-file" type="file" accept="image/*" class="p-2" />
        <button type="button" onclick="uploadImagePreview('p-img-file','p-img-preview')" class="px-3 py-2 bg-white border rounded">Upload</button>
        <img id="p-img-preview" src="" alt="preview" class="w-20 h-14 object-cover rounded border" />
    </div>
    <div class="freshness-input-container">
    <label class="block text-sm font-medium text-gray-700 mb-1">Freshness Level</label>
    <div class="flex items-center gap-3">
        <input id="p-freshness" type="range" min="0" max="100" value="100" class="flex-1 freshness-slider" oninput="updateFreshnessDisplay(this.value)" />
        <div class="freshness-display">
            <span id="freshness-value" class="text-lg font-bold">100</span>%
        </div>
    </div>
    <div class="freshness-indicator mt-2">
        <div id="freshness-bar" class="freshness-bar" style="width: 100%; background: #22c55e;"></div>
    </div>
</div>
    <div class="flex items-center gap-3">
        <label class="flex items-center gap-2"><input id="p-preorder" type="checkbox"/> <span class="text-sm">Pre-Order</span></label>
        <input id="p-preorder-duration" type="number" min="7" max="14" placeholder="Duration (7-14 days)" class="p-2 border rounded w-48" />
    </div>
    </form>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button onclick="adminSaveProduct()" class="px-4 py-2 bg-lime-600 text-white rounded">Create</button>`);
};

window.adminSaveProduct = async function(editId = null) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="btn btn-secondary">OK</button>`);
    }
    
    const name = document.getElementById('p-name')?.value?.trim();
    const description = document.getElementById('p-description')?.value?.trim() || '';
    const price = parseFloat(document.getElementById('p-price')?.value);
    const qty = parseInt(document.getElementById('p-qty')?.value);
    const unit = document.getElementById('p-unit')?.value?.trim();
    const orderLimit = parseInt(document.getElementById('p-order-limit')?.value) || null;
    const origin = document.getElementById('p-origin')?.value?.trim();
    const farmer = document.getElementById('p-farmer')?.value?.trim();
    const contact = document.getElementById('p-contact')?.value?.trim();
    const freshness = parseInt(document.getElementById('p-freshness')?.value) || 100;
    const fileInput = document.getElementById('p-img-file');
    const preview = document.getElementById('p-img-preview');

    if(!name || isNaN(price) || isNaN(qty) || !unit || !origin || !farmer || !contact){
        return showModal('Missing fields', 'Please fill all product fields correctly.', `<button onclick="hideModal()" class="btn btn-secondary">OK</button>`);
    }

    let imgUrl = '';
    
    if (fileInput.files.length > 0) {
        try {
            console.log('Starting Cloudinary upload with file:', fileInput.files[0]);
            const uploadResult = await cloudinary.uploadImage(fileInput.files[0]);
            imgUrl = uploadResult.url;
            console.log('Cloudinary upload successful:', imgUrl);
        } catch (uploadError) {
            console.error('Cloudinary upload failed:', uploadError);
            return showModal('Upload Error', 'Failed to upload image: ' + uploadError.message, `<button onclick="hideModal()" class="btn btn-secondary">OK</button>`);
        }
    } else {
        imgUrl = preview.src || `https://placehold.co/600x360/4ade80/ffffff?text=${encodeURIComponent(name || 'Product')}`;
        console.log('Using existing or placeholder image:', imgUrl);
    }

    const isPre = document.getElementById('p-preorder')?.checked;
    const dur = parseInt(document.getElementById('p-preorder-duration')?.value) || null;
    
    if(editId){
        const productUpdate = { 
            name, 
            description,
            price, 
            quantity: qty, 
            unit, 
            orderLimit: orderLimit,
            origin, 
            farmer: { name: farmer, contact }, 
            imgUrl: imgUrl,
            freshness: freshness,
        };
        if(isPre){
            productUpdate.preorder = true;
            productUpdate.preorderDuration = Math.min(14, Math.max(7, (dur || 7)));
            productUpdate.preorderStart = Date.now();
        } else {
            productUpdate.preorder = false;
            delete productUpdate.preorderDuration;
            delete productUpdate.preorderStart;
        }
        await updateFirebase(`products/${editId}`, productUpdate);
        
        // ✅ NEW: Show success message and close modal
        hideModal();
        showModal('✅ Product Updated', 'Product has been updated successfully.', 
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } else {
        const newId = Date.now();
        const newProd = { 
            id: newId, 
            name, 
            description,
            price, 
            quantity: qty, 
            unit,
            orderLimit: orderLimit,
            origin, 
            farmer: { name: farmer, contact }, 
            imgUrl: imgUrl,
            freshness: freshness,
        };
        if(isPre){
            newProd.preorder = true;
            newProd.preorderDuration = Math.min(14, Math.max(7, (dur || 7)));
            newProd.preorderStart = Date.now();
        }
        await saveToFirebase(`products/${newId}`, newProd);
        
        // ✅ NEW: Show success message and close modal
        hideModal();
        showModal('✅ Product Added', 'New product has been added successfully.', 
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    }
};

window.adminEditProduct = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const p = window.APP_STATE.products.find(x=> x.id === id);
    if(!p) return;
 
    showModal('Edit Product', `
    <form id="product-form" class="grid gap-3">
    <input id="p-name" value="${p.name}" placeholder="Product name" class="p-2 border rounded" />
    <textarea id="p-description" placeholder="Product description (optional)" rows="3" class="p-2 border rounded resize-none">${p.description || ''}</textarea>
    <div class="grid grid-cols-3 gap-2">
        <input id="p-price" type="number" step="0.01" value="${p.price}" placeholder="Price (₱)" class="p-2 border rounded col-span-1" />
        <input id="p-qty" type="number" value="${p.quantity}" placeholder="Quantity" class="p-2 border rounded" />
        <select id="p-unit" class="p-2 border rounded">
            <option value="kg" ${p.unit === 'kg' ? 'selected' : ''}>kg</option>
            <option value="1/2 kg" ${p.unit === '1/2 kg' ? 'selected' : ''}>1/2 kg</option>
            <option value="1/4 kg" ${p.unit === '1/4 kg' ? 'selected' : ''}>1/4 kg</option>
            <option value="pc" ${p.unit === 'pc' ? 'selected' : ''}>pc</option>
            <option value="pack" ${p.unit === 'pack' ? 'selected' : ''}>pack</option>
            <option value="bundle" ${p.unit === 'bundle' ? 'selected' : ''}>bundle</option>
        </select>
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Order Limit per Customer (optional)</label>
        <input id="p-order-limit" type="number" min="1" value="${p.orderLimit || ''}" placeholder="e.g., 5 (leave empty for no limit)" class="p-2 border rounded w-full" />
        <div class="text-xs text-gray-500 mt-1">Maximum quantity a customer can order at once</div>
    </div>
    <input id="p-origin" value="${p.origin}" placeholder="Origin (Farm name)" class="p-2 border rounded" />
    <div class="grid grid-cols-2 gap-2">
        <input id="p-farmer" value="${p.farmer.name}" placeholder="Farmer name" class="p-2 border rounded" />
        <input id="p-contact" value="${p.farmer.contact}" placeholder="Farmer contact" class="p-2 border rounded" />
    </div>
    <div class="flex items-center gap-3">
        <input id="p-img-file" type="file" accept="image/*" class="p-2" />
        <button type="button" onclick="uploadImagePreview('p-img-file','p-img-preview')" class="px-3 py-2 bg-white border rounded">Upload</button>
        <img id="p-img-preview" src="${p.imgUrl || ''}" alt="preview" class="w-28 h-16 object-cover rounded border" />
    </div>
    <div class="freshness-input-container">
    <label class="block text-sm font-medium text-gray-700 mb-1">Freshness Level</label>
    <div class="flex items-center gap-3">
        <input id="p-freshness" type="range" min="0" max="100" value="${p.freshness || 100}" class="flex-1 freshness-slider" oninput="updateFreshnessDisplay(this.value)" />
        <div class="freshness-display">
            <span id="freshness-value" class="text-lg font-bold">${p.freshness || 100}</span>%
        </div>
    </div>
    <div class="freshness-indicator mt-2">
        <div id="freshness-bar" class="freshness-bar" style="width: ${p.freshness || 100}%; background: ${(p.freshness || 100) >= 90 ? '#22c55e' : (p.freshness || 100) >= 70 ? '#84cc16' : (p.freshness || 100) >= 50 ? '#eab308' : '#f97316'};"></div>
    </div>
</div>
    <div class="flex items-center gap-3">
        <label class="flex items-center gap-2"><input id="p-preorder" type="checkbox" ${p.preorder ? 'checked' : ''}/> <span class="text-sm">Pre-Order</span></label>
        <input id="p-preorder-duration" type="number" min="7" max="14" value="${p.preorderDuration || ''}" placeholder="Duration (7-14 days)" class="p-2 border rounded w-48" />
    </div>
    </form>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
         <button onclick="adminSaveProduct(${id})" class="px-4 py-2 bg-lime-600 text-white rounded">Save</button>`);
};

window.adminDeleteProduct = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    showModal('Confirm delete', `Are you sure you want to delete this product?`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
    <button onclick="adminConfirmDelete(${id})" class="px-4 py-2 bg-red-600 text-white rounded">Delete</button>`);
};

window.adminConfirmDelete = async function(id) {
    try {
        const prodToDelete = window.APP_STATE.products.find(p => p.id === id);
        
        // ✅ Save to deletion logs
        const deleteLogs = await getFromFirebase('deleteLogs') || {};
        const logId = 'DEL-' + uid();
        
        deleteLogs[logId] = {
            id: logId,
            itemType: 'product',
            itemId: id,
            deletedBy: window.APP_STATE.currentUser ? window.APP_STATE.currentUser.email : 'unknown',
            date: new Date().toLocaleString(),
            snapshot: prodToDelete || null
        };
        
        await saveToFirebase('deleteLogs', deleteLogs);
        
        // ✅ Delete the product
        await remove(ref(database, `products/${id}`));
        
        // ✅ Close modal and show success
        hideModal();
        showModal('✅ Product Deleted', 'Product has been deleted successfully.', 
            `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
        
        // ✅ REMOVED: Don't manually update APP_STATE or call renderMain() - let the listener handle it
        
    } catch (error) {
        console.error('❌ Error deleting product:', error);
        hideModal();
        showModal('Error', 'Failed to delete product. Please try again.', 
            `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Add this new function to verify database sync
window.verifyDatabaseSync = async function() {
    console.log('🔍 Starting Database Verification...');
    
    try {
        // Test 1: Check products
        const productsSnapshot = await get(ref(database, 'products'));
        const productsData = productsSnapshot.exists() ? productsSnapshot.val() : null;
        console.log('📦 Products in Firebase:', productsData);
        console.log('📦 Products in APP_STATE:', window.APP_STATE.products);
        
        // Test 2: Check orders
        const ordersSnapshot = await get(ref(database, 'orders'));
        const ordersData = ordersSnapshot.exists() ? ordersSnapshot.val() : null;
        console.log('📋 Orders in Firebase:', ordersData);
        console.log('📋 Orders in APP_STATE:', window.APP_STATE.orders);
        
        // Test 3: Check users
        const usersSnapshot = await get(ref(database, 'users'));
        const usersData = usersSnapshot.exists() ? usersSnapshot.val() : null;
        console.log('👥 Users in Firebase:', usersData);
        
        // Test 4: Check chats
        const chatsSnapshot = await get(ref(database, 'chats'));
        const chatsData = chatsSnapshot.exists() ? chatsSnapshot.val() : null;
        console.log('💬 Chats in Firebase:', chatsData);
        console.log('💬 Chats in APP_STATE:', window.APP_STATE.chats);
        
        console.log('✅ Database verification complete');
        return {
            productsMatch: JSON.stringify(productsData) === JSON.stringify(window.APP_STATE.products),
            ordersMatch: JSON.stringify(ordersData) === JSON.stringify(window.APP_STATE.orders),
            chatsMatch: JSON.stringify(chatsData) === JSON.stringify(window.APP_STATE.chats)
        };
    } catch (error) {
        console.error('❌ Database verification failed:', error);
        return null;
    }
};

window.adminViewOrder = async function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const o = window.APP_STATE.orders.find(x=> x.id === id);
    if(!o) return;

    // Get customer profile from order or from users database
    let profile = o.customerProfile || {};
    
    if(!profile.idUrl && o.userId) {
        const userData = await getFromFirebase(`users/${o.userId}`);
        if(userData && userData.profile) {
            profile = userData.profile;
        }
    }

    const items = o.items.map(it => `<li class="flex justify-between"><span>${it.quantity} × ${it.name} (${it.unit})</span><span>${formatPeso(it.price * it.quantity)}</span></li>`).join('');
    
    // Status badge color
    const statusColor = 
        o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
        o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
        o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
        o.status === 'Attempt Delivery Failed' ? 'bg-red-100 text-red-800' :
        o.status === 'Pre-Order Received' ? 'bg-orange-100 text-orange-800' :
        'bg-gray-100 text-gray-800';
    
    showModal(`Order ${o.id}`, `
    <div class="grid gap-3">
      <div class="bg-gray-50 p-3 rounded border-l-4 border-lime-600">
        <h4 class="font-semibold text-gray-800 mb-2">Order Details</h4>
        <div class="space-y-1 text-sm">
          <div><b>Customer:</b> ${o.customer}</div>
          <div><b>Email:</b> ${o.email || ''}</div>
          <div><b>Contact:</b> ${o.contact}</div>
          <div><b>Address:</b> ${o.address}</div>
          <div><b>Date:</b> ${o.date}</div>
          <div><b>Status:</b> <span class="badge ${statusColor} px-2 py-1 rounded">${o.status}</span></div>
          ${o.status === 'Attempt Delivery Failed' ? `
            <div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <b>⚠️ Delivery Failed:</b> Contact customer to reschedule delivery.
            </div>
          ` : ''}
        </div>
      </div>

      ${profile.fullName ? `
        <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-600">
          <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <i data-lucide="user-check" class="w-4 h-4"></i>
            Customer Profile
            ${profile.verified ? '<span class="text-xs bg-green-500 text-white px-2 py-0.5 rounded">Verified</span>' : '<span class="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded">Pending</span>'}
          </h4>
          <div class="space-y-1 text-sm">
            <div><b>Full Name:</b> ${profile.fullName}</div>
            <div><b>Birthday:</b> ${profile.birthday || 'N/A'}</div>
            <div><b>Age:</b> ${profile.age || 'N/A'}</div>
            <div><b>Home Address:</b> ${profile.homeAddress || 'N/A'}</div>
            <div><b>ID Type:</b> ${profile.idType || 'N/A'}</div>
            ${profile.idUrl ? `
              <div class="pt-2">
                <button onclick="viewUploadedID('${profile.idUrl}')" class="text-sm text-blue-600 underline flex items-center gap-1">
                  <i data-lucide="file-text" class="w-3 h-3"></i>
                  View Valid ID
                </button>
              </div>
            ` : '<div class="text-xs text-gray-500 pt-2">No ID uploaded</div>'}
            ${!profile.verified && profile.idUrl ? `
              <div class="pt-2 flex gap-2">
                <button onclick="verifyCustomerProfile('${o.userId}')" class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                  ✓ Verify Profile
                </button>
                <button onclick="denyCustomerProfile('${o.userId}')" class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                  ✗ Deny Profile
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      ` : `
        <div class="bg-yellow-50 p-3 rounded border-l-4 border-yellow-500">
          <div class="flex items-center gap-2 text-sm text-yellow-800">
            <i data-lucide="alert-circle" class="w-4 h-4"></i>
            <span>Customer has not completed their profile yet</span>
          </div>
        </div>
      `}

      <div class="bg-gray-50 p-3 rounded">
        <h4 class="font-semibold text-gray-800 mb-2">Items</h4>
        <ul class="space-y-1">${items}</ul>
      </div>

      <div class="bg-gray-50 p-3 rounded">
        <div><b>Subtotal:</b> ${formatPeso(o.subtotal || o.total)}</div>
        ${o.deliveryFee ? `<div><b>Delivery Fee:</b> ${formatPeso(o.deliveryFee)}</div>` : ''}
        <div class="text-lg mt-2"><b>Total:</b> ${formatPeso(o.total)}</div>
      </div>
    </div>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button><button onclick="adminEditOrder('${o.id}')" class="px-4 py-2 bg-lime-600 text-white rounded">Update Status</button>`);
    
    setTimeout(() => icons(), 100);
};

// Verify customer profile
window.verifyCustomerProfile = async function(userId) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    try {
        // Get user data to display confirmation
        const userData = await getFromFirebase(`users/${userId}`);
        const profile = userData.profile || {};

        // Show confirmation modal with profile details
        showModal('Verify Customer Profile', `
            <div class="space-y-3">
                <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
                    <div class="text-sm font-semibold mb-2">Profile to Verify:</div>
                    <div class="space-y-1 text-sm">
                        <div><b>Name:</b> ${profile.fullName}</div>
                        <div><b>Birthday:</b> ${profile.birthday}</div>
                        <div><b>Age:</b> ${profile.age}</div>
                        <div><b>Address:</b> ${profile.homeAddress}</div>
                        <div><b>ID Type:</b> ${profile.idType}</div>
                    </div>
                </div>
                
                ${profile.idUrl ? `
                    <div class="text-center">
                        <button onclick="viewUploadedID('${profile.idUrl}')" class="text-sm text-blue-600 underline">
                            View Uploaded ID
                        </button>
                    </div>
                ` : ''}
                
                <div class="bg-yellow-50 p-3 rounded border-l-4 border-yellow-500">
                    <div class="text-xs text-yellow-800">
                        <b>⚠️ Important:</b> Please verify that the ID matches the profile information before approving.
                    </div>
                </div>
            </div>
        `, `
            <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
            <button onclick="confirmVerifyProfile('${userId}')" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">✓ Verify & Approve</button>
        `);
        
        setTimeout(() => icons(), 100);
    } catch (error) {
        console.error('Error loading profile:', error);
        showModal('Error', 'Failed to load profile. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.viewUserProfile = async function(userId) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    try {
        const userData = await getFromFirebase(`users/${userId}`);
        if(!userData || !userData.profile) {
            return showModal('Error', 'User profile not found.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
        }

        const profile = userData.profile;

        showModal('Customer Profile', `
            <div class="space-y-3">
                <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-600">
                    <h4 class="font-semibold text-gray-800 mb-2 flex items-center justify-between">
                        <span class="flex items-center gap-2">
                            <i data-lucide="user" class="w-4 h-4"></i>
                            Profile Information
                        </span>
                        ${profile.verified ? 
                            '<span class="text-xs bg-green-500 text-white px-2 py-0.5 rounded">Verified</span>' : 
                            profile.denied ?
                            '<span class="text-xs bg-red-500 text-white px-2 py-0.5 rounded">Denied</span>' :
                            '<span class="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded">Pending</span>'
                        }
                    </h4>
                    <div class="space-y-2 text-sm">
                        <div><b>Full Name:</b> ${profile.fullName}</div>
                        <div><b>Email:</b> ${userData.email}</div>
                        <div><b>Contact:</b> ${userData.contact || 'N/A'}</div>
                        <div><b>Birthday:</b> ${profile.birthday}</div>
                        <div><b>Age:</b> ${profile.age}</div>
                        <div><b>Home Address:</b> ${profile.homeAddress}</div>
                        <div><b>ID Type:</b> ${profile.idType}</div>
                        ${profile.submittedAt ? `<div class="text-xs text-gray-500"><b>Submitted:</b> ${new Date(profile.submittedAt).toLocaleString()}</div>` : ''}
                        ${profile.verifiedAt ? `<div class="text-xs text-gray-500"><b>Verified:</b> ${new Date(profile.verifiedAt).toLocaleString()}</div>` : ''}
                        ${profile.deniedAt ? `<div class="text-xs text-gray-500"><b>Denied:</b> ${new Date(profile.deniedAt).toLocaleString()}</div>` : ''}
                    </div>
                </div>

                ${profile.denied ? `
                    <div class="bg-red-50 p-3 rounded border border-red-200">
                        <div class="text-xs text-red-700 font-semibold mb-1">Denial Reason:</div>
                        <div class="text-sm text-red-900">${profile.denialReason || 'No reason provided'}</div>
                    </div>
                ` : ''}

                ${profile.idUrl ? `
                    <div class="bg-gray-50 p-3 rounded">
                        <h4 class="font-semibold text-gray-800 mb-2">Valid ID</h4>
                        <div class="flex justify-center">
                            ${profile.idUrl.endsWith('.pdf') ? 
                                `<embed src="${profile.idUrl}" type="application/pdf" width="100%" height="400px" />` :
                                `<img src="${profile.idUrl}" alt="Valid ID" class="max-w-full h-auto rounded border" />`
                            }
                        </div>
                    </div>
                ` : '<div class="text-center text-gray-500">No ID uploaded</div>'}
            </div>
        `, `
            <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>
            ${!profile.verified && profile.idUrl && !profile.denied ? `
                <button onclick="verifyCustomerProfile('${userId}')" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">✓ Verify Profile</button>
                <button onclick="denyCustomerProfile('${userId}')" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">✗ Deny Profile</button>
            ` : ''}
            ${profile.denied && profile.idUrl ? `
                <button onclick="verifyCustomerProfile('${userId}')" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">✓ Approve Now</button>
            ` : ''}
        `);

        setTimeout(() => icons(), 100);
    } catch (error) {
        console.error('Error viewing profile:', error);
        showModal('Error', 'Failed to load profile. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Add new confirmation function
window.confirmVerifyProfile = async function(userId) {
    try {
        await updateFirebase(`users/${userId}/profile`, { 
            verified: true,
            verifiedAt: new Date().toISOString(),
            verifiedBy: window.APP_STATE.currentUser.email
        });
        
        hideModal();
        showModal('Profile Verified! ✓', `
            <div class="text-center space-y-3">
                <div class="text-5xl text-green-600">✓</div>
                <p class="text-gray-700">Customer profile has been successfully verified.</p>
                <p class="text-sm text-gray-600">The customer can now place orders.</p>
            </div>
        `, `<button onclick="hideModal(); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } catch (error) {
        console.error('Error verifying profile:', error);
        showModal('Error', 'Failed to verify profile. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Deny customer profile with reason
window.denyCustomerProfile = async function(userId) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    try {
        // Get user data to display in confirmation
        const userData = await getFromFirebase(`users/${userId}`);
        const profile = userData.profile || {};

        // Show denial reason modal
        showModal('Deny Profile Verification', `
            <div class="space-y-3">
                <div class="bg-red-50 p-3 rounded border-l-4 border-red-500">
                    <div class="text-sm font-semibold mb-2 text-red-800">Profile to Deny:</div>
                    <div class="space-y-1 text-sm text-red-900">
                        <div><b>Name:</b> ${profile.fullName}</div>
                        <div><b>Email:</b> ${userData.email}</div>
                        <div><b>ID Type:</b> ${profile.idType}</div>
                    </div>
                </div>
                
                <div class="bg-yellow-50 p-3 rounded border-l-4 border-yellow-500">
                    <div class="text-xs text-yellow-800">
                        <b>⚠️ Important:</b> Please provide a clear reason for denial. The user will be notified.
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Reason for Denial <span class="text-red-600">*</span></label>
                    <textarea id="denial-reason" rows="4" placeholder="e.g., ID image is blurry, ID type doesn't match profile, information is incomplete..." class="w-full p-2 border rounded resize-none" required></textarea>
                    <div class="text-xs text-gray-500 mt-1">Be specific to help the user fix the issue</div>
                </div>
                
                <div id="denial-error" class="text-xs text-red-600 mt-1 hidden font-semibold"></div>
            </div>
        `, `
            <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
            <button onclick="confirmDenyProfile('${userId}')" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">✗ Deny Profile</button>
        `);
        
        setTimeout(() => icons(), 100);
    } catch (error) {
        console.error('Error loading profile for denial:', error);
        showModal('Error', 'Failed to load profile. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

// Confirm denial with reason
window.confirmDenyProfile = async function(userId) {
    const denialReason = document.getElementById('denial-reason')?.value?.trim();
    const errorDiv = document.getElementById('denial-error');
    
    if (typeof renderMain === 'function') await renderMain();

    // Validate reason
    if(!denialReason || denialReason.length < 10) {
        if(errorDiv) {
            errorDiv.textContent = '⚠️ Please provide a detailed reason (at least 10 characters)';
            errorDiv.classList.remove('hidden');
        }
        return;
    }
    
    try {
        // Update user profile with denial status
        await updateFirebase(`users/${userId}/profile`, { 
            verified: false,
            denied: true,
            denialReason: denialReason,
            deniedAt: new Date().toISOString(),
            deniedBy: window.APP_STATE.currentUser.email,
            // Remove submitted status so they can resubmit
            submittedAt: null
        });
        
        // Log the denial action
        const denialLogId = 'DENIAL-' + uid();
        await saveToFirebase(`denialLogs/${denialLogId}`, {
            id: denialLogId,
            userId: userId,
            reason: denialReason,
            deniedBy: window.APP_STATE.currentUser.email,
            deniedAt: new Date().toISOString()
        });
        
        hideModal();
        showModal('Profile Denied', `
            <div class="text-center space-y-3">
                <div class="text-5xl text-red-600">✗</div>
                <p class="text-gray-700">Profile verification has been denied.</p>
                <div class="bg-red-50 p-3 rounded text-left border border-red-200">
                    <div class="text-xs text-red-800 font-semibold mb-1">Reason provided:</div>
                    <div class="text-sm text-red-900">${denialReason}</div>
                </div>
                <p class="text-sm text-gray-600">The user can update their profile and resubmit for verification.</p>
            </div>
        `, `<button onclick="hideModal(); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } catch (error) {
        console.error('Error denying profile:', error);
        showModal('Error', 'Failed to deny profile. Please try again.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};



window.adminEditOrder = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const o = window.APP_STATE.orders.find(x=> x.id === id);
    if(!o) return;
    const statuses = ['Preparing Order', 'Ready to Deliver', 'Out for Delivery', 'Delivered', 'Attempt Delivery Failed'];
    const options = statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('');
    showModal(`Update ${o.id}`, `
    <div>
      <div class="mb-2">Current status: <b>${o.status}</b></div>
      <select id="order-new-status" class="p-2 border rounded w-full">${options}</select>
    </div>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button><button onclick="adminSaveOrderStatus('${o.id}')" class="px-4 py-2 bg-lime-600 text-white rounded">Save</button>`);
};

window.adminSaveOrderStatus = async function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const newS = document.getElementById('order-new-status')?.value;
    await updateFirebase(`orders/${id}`, { status: newS });
    hideModal();
};

window.adminUpdateDeliveryFee = function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    showModal('Update Delivery Fee', `
        <div class="grid gap-3">
            <div class="text-sm text-gray-600">Set the delivery fee for all orders</div>
            <div class="flex items-center gap-2">
                <span class="text-gray-700">₱</span>
                <input id="new-delivery-fee" type="number" step="0.01" min="0" value="${window.APP_STATE.deliveryFee}" class="flex-1 p-2 border rounded" />
            </div>
            <div class="text-xs text-gray-500">Current fee: ${formatPeso(window.APP_STATE.deliveryFee)}</div>
        </div>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button onclick="adminSaveDeliveryFee()" class="px-4 py-2 bg-lime-600 text-white rounded">Save</button>`);
};

window.adminSaveDeliveryFee = async function() {
    const newFee = parseFloat(document.getElementById('new-delivery-fee')?.value);
    
    if(isNaN(newFee) || newFee < 0) {
        return showModal('Invalid Amount', 'Please enter a valid delivery fee.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    await saveToFirebase('settings/deliveryFee', newFee);
    window.APP_STATE.deliveryFee = newFee;
    
    hideModal();
    showModal('Success', `Delivery fee updated to ${formatPeso(newFee)}`, `<button onclick="hideModal(); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
};

window.adminDeleteOrder = function(id) {
    if (!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
 
    showModal('Confirm Delete', `Are you sure you want to delete this order <b>${id}</b>? This action cannot be undone.`,
    `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
     <button onclick="adminConfirmDeleteOrder('${id}')" class="px-4 py-2 bg-red-600 text-white rounded">Delete</button>`);
};
    
window.adminConfirmDeleteOrder = async function(id) {
    const orderToDelete = window.APP_STATE.orders.find(o => o.id === id);
    const deleteLogs = await getFromFirebase('deleteLogs') || {};
    const logId = 'DEL-' + uid();
    
    deleteLogs[logId] = {
        id: logId,
        itemType: 'order',
        itemId: id,
        deletedBy: window.APP_STATE.currentUser ? window.APP_STATE.currentUser.email : 'unknown',
        date: new Date().toLocaleString(),
        snapshot: orderToDelete || null
    };
    
    await saveToFirebase('deleteLogs', deleteLogs);
    await remove(ref(database, `orders/${id}`));
    hideModal();
};

window.viewDeleteLogs = async function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    const logs = await getFromFirebase('deleteLogs') || {};
    const logsArray = Object.values(logs);
    if(!logsArray.length){
        return showModal('Deletion Logs', '<div class="text-gray-600">No deletions recorded yet.</div>', `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">Close</button>`);
    }
    const tableRows = logsArray.map(l => `
        <tr class="border-b">
            <td class="p-2">${l.id}</td>
            <td class="p-2">${l.itemType || ''}</td>
            <td class="p-2">${l.itemId || ''}</td>
            <td class="p-2">${l.deletedBy}</td>
            <td class="p-2">${l.date}</td>
        </tr>
    `).join('');
    const tableHtml = `
        <div class="max-h-80 overflow-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-100 text-gray-700 sticky top-0">
              <tr>
                <th class="p-2">Log ID</th>
                <th class="p-2">Type</th>
                <th class="p-2">Item ID</th>
                <th class="p-2">Deleted By</th>
                <th class="p-2">Date</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;
    showModal('Deletion Logs', tableHtml, `<button onclick="hideModal()" class="px-4 py-2 bg-lime-600 text-white rounded">Close</button>`);
};

// Helper functions
window.$ = function(sel){ return document.querySelector(sel); };
window.$all = function(sel){ return Array.from(document.querySelectorAll(sel)); };
window.formatPeso = function(n){ return '₱' + Number(n).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); };

window.getStatusDescription = function(status) {
    const descriptions = {
        'Preparing Order': 'Your order is being prepared by the seller.',
        'Ready to Deliver': 'Your order is ready and will be picked up by the delivery rider soon.',
        'Out for Delivery': 'Your order is on the way to your address.',
        'Delivered': 'Your order has been successfully delivered.',
        'Attempt Delivery Failed': 'Delivery was attempted but failed. The rider will contact you for re-delivery.',
        'Pre-Order Received': 'Your pre-order has been received and is being processed.'
    };
    return descriptions[status] || 'Order status updated.';
};


// ✅ RECOMMENDED: Generate uniform 8-digit numeric Order ID
window.generateOrderId = function() {
    // Get current date/time components
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year (25)
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month (01-12)
    const day = now.getDate().toString().padStart(2, '0'); // Day (01-31)
    const hours = now.getHours().toString().padStart(2, '0'); // Hours (00-23)
    
    // Generate 2 random digits
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    
    // Format: YYMMDDHHRR (Year-Month-Day-Hour-Random)
    // Example: 25110614 = Nov 6, 2025, 14:XX with random suffix
    return year + month + day + hours.slice(0, 1) + random;
};

// Keep original uid for other purposes (chat, logs, etc.)
window.uid = function() { 
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};


// ADD THESE NEW FUNCTIONS:

// Generate 6-digit verification code
window.generateVerificationCode = function() {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Show verification code input modal
window.showVerificationModal = function(email, password) {
    showModal('Verify Your Email', `
        <div class="space-y-4">
            <p class="text-gray-700">We've sent a 6-digit verification code to:</p>
            <p class="font-semibold text-lime-700">${email}</p>
            <p class="text-sm text-gray-600">Please enter the code below (expires in 15 minutes):</p>
            
            <div class="flex justify-center gap-2">
                <input id="code-1" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
                <input id="code-2" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
                <input id="code-3" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
                <input id="code-4" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
                <input id="code-5" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
                <input id="code-6" type="text" maxlength="1" class="w-12 h-12 text-center text-2xl font-bold border-2 rounded-lg focus:border-lime-600" />
            </div>
            
            <div id="code-error" class="text-red-600 text-sm text-center hidden"></div>
            
            <div class="text-center">
                <button onclick="resendVerificationCode('${email}', '${password}')" class="text-sm text-lime-600 underline">Didn't receive code? Resend</button>
            </div>
        </div>
    `, `
        <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button onclick="verifyEmailCode('${email}', '${password}')" class="px-4 py-2 bg-lime-600 text-white rounded">Verify</button>
    `);

    setupCodeInputs();
};

// Setup code input auto-advance
window.setupCodeInputs = function() {
    const inputs = ['code-1', 'code-2', 'code-3', 'code-4', 'code-5', 'code-6'];
    
    inputs.forEach((id, index) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', function(e) {
            const value = e.target.value;
            
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }

            if (value && index < inputs.length - 1) {
                document.getElementById(inputs[index + 1]).focus();
            }
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                document.getElementById(inputs[index - 1]).focus();
            }
        });

        if (index === 0) {
            setTimeout(() => input.focus(), 100);
        }
    });
};

// Verify email code
window.verifyEmailCode = async function(email, password) {
    const code1 = document.getElementById('code-1')?.value || '';
    const code2 = document.getElementById('code-2')?.value || '';
    const code3 = document.getElementById('code-3')?.value || '';
    const code4 = document.getElementById('code-4')?.value || '';
    const code5 = document.getElementById('code-5')?.value || '';
    const code6 = document.getElementById('code-6')?.value || '';
    
    const enteredCode = code1 + code2 + code3 + code4 + code5 + code6;

    if (enteredCode.length !== 6) {
        document.getElementById('code-error').textContent = 'Please enter all 6 digits';
        document.getElementById('code-error').classList.remove('hidden');
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userData = await getFromFirebase(`users/${user.uid}`);

        if (!userData) {
            throw new Error('User data not found');
        }

        if (userData.verificationCode !== enteredCode) {
            document.getElementById('code-error').textContent = 'Invalid verification code';
            document.getElementById('code-error').classList.remove('hidden');
            await signOut(auth);
            return;
        }

        if (Date.now() > userData.verificationCodeExpiry) {
            document.getElementById('code-error').textContent = 'Verification code has expired';
            document.getElementById('code-error').classList.remove('hidden');
            await signOut(auth);
            return;
        }

        await updateFirebase(`users/${user.uid}`, {
            emailVerified: true,
            verificationCode: null,
            verificationCodeExpiry: null
        });

        window.APP_STATE.currentUser = {
            uid: user.uid,
            email: user.email,
            name: userData.name,
            role: userData.role
        };

        // ✅ NEW: Verify cart stock reservations
await verifyCartStockOnLogin(user.uid);

hideModal();
updateAuthArea();
renderMain();

        const userCart = await getFromFirebase(`carts/${user.uid}`);
        if (userCart) {
            window.APP_STATE.cart = Object.values(userCart);
        }

        // ✅ Show Data Privacy Act modal AFTER email verification
        hideModal();
        showDataPrivacyModal(user.uid, userData.name);

    } catch (error) {
        console.error('Verification error:', error);
        document.getElementById('code-error').textContent = 'Verification failed. Please try again.';
        document.getElementById('code-error').classList.remove('hidden');
    }
};

// ADD THIS NEW FUNCTION after verifyEmailCode (around line 1280)

window.showDataPrivacyModal = function(userId, userName) {
    showModal(
        'Data Privacy Act Notice',
        `
        <div class="space-y-4">
            <div class="text-center">
                <div class="text-5xl mb-3">✅</div>
                <h3 class="text-xl font-bold text-green-700 mb-2">Email Verified!</h3>
                <p class="text-gray-600">Welcome to Palengke.com, <b>${userName}</b>!</p>
            </div>
            
            <div class="border-t pt-4 space-y-3 text-left">
                <h4 class="font-semibold text-gray-800">📋 Data Privacy Notice</h4>
                <p class="text-gray-700 text-sm">
                    Pursuant to Republic Act No. 10173, the <strong>Data Privacy Act of 2012</strong>, 
                    we are committed to protecting your personal information.
                </p>
                <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
                    <p class="text-sm text-blue-900">
                        By continuing to use this platform, you consent to the collection and processing of your data 
                        for purposes of order fulfillment, delivery, and service improvement. 
                        Your information will be handled with strict confidentiality.
                    </p>
                </div>
                <p class="text-xs text-gray-600">
                    You can review our full privacy policy at any time in your account settings.
                </p>
            </div>
        </div>
        `,
        `
        <button 
            onclick="acceptDataPrivacyAfterVerification('${userId}', '${userName}')"
            class="px-6 py-3 bg-lime-600 text-white rounded-lg hover:bg-lime-700 font-semibold w-full sm:w-auto">
            I Understand & Accept
        </button>
        `
    );
};

// ADD THIS NEW FUNCTION to handle acceptance
window.acceptDataPrivacyAfterVerification = async function(userId, userName) {
    try {
        await updateFirebase(`users/${userId}`, { 
            dataPrivacyAccepted: true,
            dataPrivacyAcceptedAt: new Date().toISOString()
        });
        
        hideModal();
        updateAuthArea();
        renderMain();

        // Show welcome message
        setTimeout(() => {
            showModal(
                'Welcome! 🎉',
                `
                <div class="text-center space-y-3">
                    <div class="text-6xl">🛒</div>
                    <p class="text-gray-700 text-lg">You're all set, <b>${userName}</b>!</p>
                    <p class="text-sm text-gray-600">Start shopping for fresh products from local farmers.</p>
                </div>
                `,
                `<button onclick="hideModal(); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">Start Shopping</button>`
            );
        }, 300);

    } catch (error) {
        console.error('Error accepting privacy policy:', error);
        showModal(
            'Error',
            'We were unable to record your acknowledgment. Please try again.',
            `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`
        );
    }
};

// Resend verification code
window.resendVerificationCode = async function(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const newVerificationCode = generateVerificationCode();
        const newCodeExpiry = Date.now() + (15 * 60 * 1000);

        await updateFirebase(`users/${user.uid}`, {
            verificationCode: newVerificationCode,
            verificationCodeExpiry: newCodeExpiry
        });

        const userData = await getFromFirebase(`users/${user.uid}`);
        await sendVerificationCodeEmail(email, userData.name, newVerificationCode);
        await signOut(auth);

        showModal(
            'Code Resent',
            `<p class="text-gray-700">A new verification code has been sent to <b>${email}</b></p>`,
            `<button onclick="hideModal(); showVerificationModal('${email}', '${password}')" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`
        );

    } catch (error) {
        console.error('Resend error:', error);
        showModal(
            'Error',
            'Failed to resend verification code. Please try again.',
            `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`
        );
    }
};

window.uploadImagePreview = function(fileInputId, previewImgId) {
    const fi = document.getElementById(fileInputId);
    const img = document.getElementById(previewImgId);
    if(!fi || !fi.files || fi.files.length === 0) return;
    const f = fi.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        img.src = e.target.result;
        img.dataset.uploaded = '1';
    };
    reader.readAsDataURL(f);
};

window.icons = function() { 
    try {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } catch (error) {
        console.warn('Lucide icons failed to initialize:', error);
    }
};

window.updateFreshnessDisplay = function(value) {
    const freshnessValue = document.getElementById('freshness-value');
    const freshnessBar = document.getElementById('freshness-bar');
    
    if (freshnessValue) freshnessValue.textContent = value;
    if (freshnessBar) {
        freshnessBar.style.width = value + '%';
        
        // Change color based on freshness level
        if (value >= 90) {
            freshnessBar.style.background = '#22c55e'; // green
        } else if (value >= 70) {
            freshnessBar.style.background = '#84cc16'; // lime
        } else if (value >= 50) {
            freshnessBar.style.background = '#eab308'; // yellow
        } else {
            freshnessBar.style.background = '#f97316'; // orange
        }
    }
};

window.showModal = function(titleHtml, contentHtml, actionsHtml = '') {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <h3 class="text-xl font-bold text-gray-800">${titleHtml}</h3>
              </div>
              <div><button onclick="hideModal()" class="text-gray-500 hover:text-gray-700"><i data-lucide="x" class="w-5 h-5"></i></button></div>
          </div>
        </div>
        <div class="text-gray-700">${contentHtml}</div>
        <div class="bg-gray-50 p-4 flex justify-end gap-3">
          ${actionsHtml}
        </div>
    `;
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    icons();
};

window.hideModal = function(){ 
    const modalOverlay = document.getElementById('modal-overlay');
    modalOverlay.classList.add('hidden'); 
    modalOverlay.style.display = 'none';
    modalOverlay.removeAttribute('data-chat-id'); // 🔥 Clean up chat ID
    document.body.classList.remove('modal-open');
};

window.updateAuthArea = function() {
    const container = document.getElementById('auth-area');
    const headerActions = document.getElementById('header-actions');
    const mobileAuthArea = document.getElementById('mobile-auth-area');
    
    if(!container || !headerActions) return;

    const cartBtn = document.getElementById('cart-btn');
    if(cartBtn) cartBtn.style.display = (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin') ? 'none' : '';

    if(window.APP_STATE.currentUser) {
        container.innerHTML = `
    <div class="relative user-menu-wrapper">
        <button type="button" id="user-menu-btn" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
          <i data-lucide="user" class="w-4 h-4 text-gray-700"></i>
          <span class="text-sm font-medium text-gray-700 hidden md:inline">${window.APP_STATE.currentUser.name}</span>
          <i data-lucide="chevron-down" class="w-4 h-4 text-gray-500 dropdown-icon"></i>
        </button>
        <div id="user-menu" class="user-dropdown-menu">
          ${window.APP_STATE.currentUser.role === 'admin' ? 
            `<button type="button" onclick="goAdmin(); closeUserMenu();" class="user-dropdown-item">
              <i data-lucide="settings" class="w-4 h-4"></i>
              <span>Admin Dashboard</span>
            </button>` : 
            `<button type="button" onclick="showUserProfile(); closeUserMenu();" class="user-dropdown-item">
              <i data-lucide="user-circle" class="w-4 h-4"></i>
              <span>My Profile</span>
            </button>
            <button type="button" onclick="switchTo('orders'); closeUserMenu();" class="user-dropdown-item">
              <i data-lucide="package" class="w-4 h-4"></i>
              <span>My Orders</span>
            </button>`
          }
          <button type="button" onclick="logoutUser(); closeUserMenu();" class="user-dropdown-item user-dropdown-logout">
            <i data-lucide="log-out" class="w-4 h-4"></i>
            <span>Logout</span>
          </button>
        </div>
    </div>
`;

        // Mobile auth area
        if(mobileAuthArea) {
            mobileAuthArea.innerHTML = `
        <div class="user-menu-info">
          <div class="font-semibold">${window.APP_STATE.currentUser.name}</div>
          <div class="text-sm text-gray-600">${window.APP_STATE.currentUser.email}</div>
        </div>
        <div class="mt-3 space-y-1">
        ${window.APP_STATE.currentUser.role === 'admin' ? 
          `<button type="button" onclick="goAdmin(); closeMobileMenu();" class="mobile-nav-item">
            <i data-lucide="settings" class="w-5 h-5"></i>
            <span>Admin Dashboard</span>
          </button>` : 
          `<button type="button" onclick="showUserProfile(); closeMobileMenu();" class="mobile-nav-item">
            <i data-lucide="user-circle" class="w-5 h-5"></i>
            <span>My Profile</span>
          </button>
          <button type="button" onclick="switchTo('orders'); closeMobileMenu();" class="mobile-nav-item">
            <i data-lucide="package" class="w-5 h-5"></i>
            <span>My Orders</span>
          </button>`
        }
        <button type="button" onclick="logoutUser(); closeMobileMenu();" class="mobile-nav-item" style="color: #dc2626;">
          <i data-lucide="log-out" class="w-5 h-5"></i>
          <span>Logout</span>
        </button>
        </div>
    `;
        }

        headerActions.innerHTML = `
            ${window.APP_STATE.currentUser.role === 'admin' && window.APP_STATE.view === 'admin' ? 
                `<button type="button" id="exit-admin-btn" onclick="exitAdmin()" class="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 hidden md:inline-flex items-center gap-2">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                    <span>Exit Admin</span>
                </button>` : ''}
        `;
        
        // Initialize dropdown after a short delay
        setTimeout(() => {
            icons();
            initUserDropdown();
        }, 50);
    } else {
        container.innerHTML = `
            <div class="flex gap-2">
                <button onclick="openAuth('login')" class="px-3 py-2 rounded-lg bg-white border text-gray-700 hover:bg-gray-50">Log in</button>
                <button onclick="openAuth('signup')" class="px-3 py-2 rounded-lg bg-lime-600 text-white hover:bg-lime-700">Sign up</button>
            </div>
        `;

        if(mobileAuthArea) {
            mobileAuthArea.innerHTML = `
                <div class="flex flex-col gap-2">
                    <button onclick="openAuth('login'); closeMobileMenu();" class="px-3 py-2 rounded-lg bg-white border text-gray-700">Log in</button>
                    <button onclick="openAuth('signup'); closeMobileMenu();" class="px-3 py-2 rounded-lg bg-lime-600 text-white">Sign up</button>
                </div>
            `;
        }

        headerActions.innerHTML = '';
        icons();
    }

    window.updateChatVisibility();
};

function initUserDropdown() {
    const btn = document.getElementById('user-menu-btn');
    const menu = document.getElementById('user-menu');
    
    if (!btn || !menu) {
        console.log('⚠️ Dropdown elements not found');
        return;
    }

    console.log('🔧 Initializing user dropdown...');

    // Remove existing listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Get/create overlay
    let overlay = document.getElementById('user-menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'user-menu-overlay';
        overlay.className = 'user-menu-overlay';
        document.body.appendChild(overlay);
    }

    // Toggle on button click
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const isOpen = menu.classList.contains('show');
        
        if (isOpen) {
            menu.classList.remove('show');
            overlay.classList.remove('show');
            document.body.style.overflow = '';
        } else {
            menu.classList.add('show');
            if (window.innerWidth <= 768) {
                overlay.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        }
    });

    // Close on overlay click
    overlay.addEventListener('click', function() {
        menu.classList.remove('show');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    });

    // Close when clicking outside
    document.addEventListener('click', function(e) {
        if (!newBtn.contains(e.target) && !menu.contains(e.target) && menu.classList.contains('show')) {
            menu.classList.remove('show');
            overlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    console.log('✅ User dropdown initialized');
}

// Make closeUserMenu globally available
window.closeUserMenu = function() {
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');
    
    if (menu) menu.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
};

function closeUserMenu() {
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');
    const icon = document.querySelector('.dropdown-icon');
    
    if (!menu) return;
    
    console.log('Closing user menu');
    menu.classList.remove('show');
    
    if (icon) {
        icon.style.transform = 'rotate(0deg)';
    }
    
    if (overlay) {
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    }
}

window.openAuth = function(mode = 'login') {
    if(mode === 'login') {
    showModal('Log in', `
    <form id="login-form" class="grid gap-3">
        <input id="login-email" type="email" placeholder="Email" class="p-2 border rounded" required />
        <input id="login-password" type="password" placeholder="Password" class="p-2 border rounded" required />
        
        <div class="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500 text-xs">
            <p class="text-blue-800">
                <b>📧 Email verification required</b><br>
                New users must verify their email before logging in.
            </p>
        </div>
      </form>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
    <button onclick="loginUser()" class="px-4 py-2 bg-lime-600 text-white rounded">Log in</button>`);
} else {
        showModal('Sign up (Customer)', `
        <form id="signup-form" class="grid gap-3">
            <input id="signup-name" placeholder="Full name" class="p-2 border rounded" required />
            <input id="signup-email" type="email" placeholder="Email" class="p-2 border rounded" required />
            <input id="signup-password" type="password" placeholder="Password" class="p-2 border rounded" required />
            <input id="signup-contact" placeholder="Contact number (optional)" class="p-2 border rounded" />
          </form>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button onclick="signupUser()" class="px-4 py-2 bg-lime-600 text-white rounded">Create account</button>`);
    }
};

window.exitAdmin = function() {
    window.APP_STATE.view = 'shop';
    closeUserMenu();
    renderMain();
};

window.goAdmin = function() {
    window.APP_STATE.view = 'admin';
    window.APP_STATE.adminView = 'dashboard';
    closeUserMenu();
    renderMain();
};

window.hideUserMenu = function() {
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');
    
    if(menu) {
        menu.classList.add('hidden');
        menu.classList.remove('active');
    }
    if(overlay) {
        overlay.classList.remove('active');
    }
    document.body.classList.remove('user-menu-open');
};

window.toggleCartDrawer = function(show) {
    const drawer = document.getElementById('cart-drawer');
    
    if (!drawer) {
        console.error('Cart drawer not found');
        return;
    }
    
    if (typeof show === 'boolean') {
        if (show) {
            drawer.classList.remove('hidden');
            console.log('🛒 Cart drawer opened');
        } else {
            drawer.classList.add('hidden');
            console.log('❌ Cart drawer closed');
        }
    } else {
        drawer.classList.toggle('hidden');
        console.log('🔄 Cart drawer toggled');
    }
    
    // Only render if opening
    if (!drawer.classList.contains('hidden')) {
        renderCartDrawer();
    }
};

window.updateCartBadge = function() {
    const cnt = window.APP_STATE.cart.reduce((s,i)=>s + Number(i.quantity), 0);
    document.getElementById('cart-badge').textContent = cnt;
};

window.renderCartDrawer = function() {
    const body = document.getElementById('cart-drawer-body');
    if (!body) return;
    
    const isAdmin = window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin';
    
    if (window.APP_STATE.cart.length === 0) {
        body.innerHTML = `<div class="text-center py-12 text-gray-500">Your cart is empty – add fresh products from the shop.</div>`;
        document.getElementById('cart-subtotal').textContent = formatPeso(0);
        document.getElementById('cart-delivery-fee').textContent = formatPeso(0);
        document.getElementById('cart-total').textContent = formatPeso(0);
        updateCartBadge();
        icons();
        return;
    }
    
    const itemsHtml = window.APP_STATE.cart.map(it => {
        const product = window.APP_STATE.products.find(p => p.id === it.productId);
        const maxQty = product ? product.quantity : 0;
        const orderLimit = product && product.orderLimit ? product.orderLimit : 999;
        const currentLimit = Math.min(maxQty, orderLimit);
        
        return `
            <div class="flex items-center gap-3 py-3 border-b">
                <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="${(product || {imgUrl:''}).imgUrl}" alt="${it.name}" class="object-cover w-full h-full">
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-800 truncate">${it.name}</div>
                  <div class="text-sm text-gray-500">${formatPeso(it.price)} / ${it.unit}</div>
                  ${product && product.orderLimit ? `<div class="text-xs text-orange-600 mt-1">Max: ${product.orderLimit} ${it.unit}${product.orderLimit > 1 ? 's' : ''}</div>` : ''}
                </div>
                <div class="text-right">
                  <div class="font-semibold text-gray-800">${formatPeso(it.price * it.quantity)}</div>
                  <div class="flex gap-1 mt-2 justify-end items-center">
                    <button onclick="changeCartItem(${it.productId}, ${it.quantity - 1})" class="px-2 py-1 rounded-md text-sm bg-gray-100 hover:bg-gray-200" ${isAdmin ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>-</button>
                    <input 
                        type="number" 
                        value="${it.quantity}" 
                        min="1"
                        max="${currentLimit}"
                        onchange="changeCartItem(${it.productId}, parseInt(this.value) || 1)"
                        class="w-12 px-1 py-1 text-center text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-lime-500"
                        ${isAdmin ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}
                    />
                    <button onclick="changeCartItem(${it.productId}, ${it.quantity + 1})" class="px-2 py-1 rounded-md text-sm bg-gray-100 hover:bg-gray-200" ${isAdmin ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>+</button>
                    <button onclick="removeCartItem(${it.productId})" class="px-2 py-1 rounded-md text-sm bg-red-50 text-red-600 hover:bg-red-100" ${isAdmin ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Remove</button>
                  </div>
                </div>
            </div>
        `;
    }).join('');
    
    body.innerHTML = itemsHtml;
    const subtotal = window.APP_STATE.cart.reduce((s,i)=> s + (i.price * i.quantity), 0);
    const deliveryFee = subtotal > 0 ? window.APP_STATE.deliveryFee || 25.00 : 0;
    const total = subtotal + deliveryFee;

    document.getElementById('cart-subtotal').textContent = formatPeso(subtotal);
    document.getElementById('cart-delivery-fee').textContent = formatPeso(deliveryFee);
    document.getElementById('cart-total').textContent = formatPeso(total);
    
    // Update checkout button visibility
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        if (isAdmin) {
            checkoutBtn.style.display = 'none';
        } else {
            checkoutBtn.style.display = 'block';
        }
    }
    
    updateCartBadge();
    icons();
};

window.computeRemainingDays = function(p) {
    if(!p || !p.preorder) return null;
    const start = p.preorderStart || 0;
    const duration = p.preorderDuration || 0;
    const end = start + duration * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const rem = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return rem;
};

window.getFreshnessEmoji = function(indicator) {
    const emojis = {
        'farm-fresh': '🌱',
        'very-fresh': '✨',
        'fresh': '🍃',
        'good': '👍',
        'fair': '⚠️'
    };
    return emojis[indicator] || '📦';
};

window.updatePreorderStatuses = function() {
    let changed = false;
    for(const p of window.APP_STATE.products) {
        if(p.preorder) {
            const rem = computeRemainingDays(p);
            if(rem <= 0) {
                delete p.preorder;
                delete p.preorderDuration;
                delete p.preorderStart;
                changed = true;
            }
        }
    }
    if(changed) {
        window.APP_STATE.products.forEach(p => {
            if(p.id) updateFirebase(`products/${p.id}`, p);
        });
    }
};

window.renderMain = async function() {
    
    const main = document.getElementById('main-content');

    const searchSection = document.getElementById('search-section');
    
    if (searchSection) {
        if (window.APP_STATE.view === 'shop') {
            searchSection.style.display = 'block';
        } else {
            searchSection.style.display = 'none';
        }
    }

    const viewOrdersBtn = document.getElementById('view-orders');
    if(window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin') {
        viewOrdersBtn.classList.remove('hidden');
        viewOrdersBtn.textContent = 'Orders (All)';
    } else if(window.APP_STATE.currentUser) {
        viewOrdersBtn.classList.remove('hidden');
        viewOrdersBtn.textContent = 'My Orders';
    } else {
        viewOrdersBtn.classList.add('hidden');
    }

    updatePreorderStatuses();

    if(window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin' && window.APP_STATE.view === 'admin') {
    if(window.APP_STATE.adminView === 'verification') {
        main.innerHTML = await renderUserVerificationPage();
    } else {
        // ✅ Clear search state when entering admin dashboard
        window.APP_STATE.orderSearchQuery = '';
        window.APP_STATE.preorderSearchQuery = '';
        
        main.innerHTML = await renderAdminDashboard();
            
            // Re-initialize search listeners after DOM update
            main.innerHTML = await renderAdminDashboard();

// Re-initialize search listeners after DOM update
setTimeout(() => {
    initializeOrderSearchListeners();
    
    // ✅ IMPORTANT: Clear the saved search values too
    orderSearchValue = '';
    orderSearchCursor = 0;
    preorderSearchValue = '';
    preorderSearchCursor = 0;
    
    // Make sure inputs are empty
    const newOrderInput = document.getElementById('order-search-input');
    const newPreorderInput = document.getElementById('preorder-search-input');
    
    if (newOrderInput) {
        newOrderInput.value = '';
    }
    if (newPreorderInput) {
        newPreorderInput.value = '';
    }
}, 50);
        }
    }
    
    else {
        if(window.APP_STATE.view === 'shop') main.innerHTML = renderShop();
        else main.innerHTML = renderOrdersPublic();
    }
    
    icons();
    updateCartBadge();
    renderCartDrawer();

    setTimeout(() => {
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.onclick = function(e) {
            e.preventDefault();
            console.log('🛒 Checkout clicked');
            checkout();
        };
    }
}, 100);
    
    // Restore search input value if exists
    const searchInput = document.getElementById('search-input');
    if (searchInput && window.APP_STATE.searchQuery) {
        searchInput.value = window.APP_STATE.searchQuery;
    }
};

window.switchTo = function(v) {
    window.APP_STATE.view = v;
    
    // Clear search queries when switching views
    if (v !== 'shop') {
        window.APP_STATE.searchQuery = '';
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
    }
    
    if (v !== 'admin') {
        window.APP_STATE.orderSearchQuery = '';
        window.APP_STATE.preorderSearchQuery = '';
    }
    
    closeMobileMenu();
    renderMain();
};

window.renderShop = function() {
    // ✅ Filter products based on search query
    const filteredProducts = filterProducts(window.APP_STATE.products);
    
    // ✅ Update search results count
    updateSearchResultsCount(filteredProducts.length, window.APP_STATE.products.length);
    
    const grid = filteredProducts.length ? filteredProducts.map(p => {
        const lowStock = p.quantity <= 5;
        const isPre = !!p.preorder;
        const rem = isPre ? computeRemainingDays(p) : null;
        const preorderBadge = isPre ? `<div class="badge bg-yellow-100 text-yellow-700">🟡 Pre-Order • ${rem>0? rem + ' days left' : 'Ending'}</div>` : '';
        
        // ✅ UPDATED: Better freshness indicator logic
        const getFreshnessIndicator = (freshness) => {
            if (!freshness) return 'fresh';
            if (freshness >= 90) return 'farm-fresh';
            if (freshness >= 70) return 'very-fresh';
            if (freshness >= 50) return 'fresh';
            if (freshness >= 30) return 'good';
            return 'fair';
        };
        
        // ✅ Set freshness indicator if not already set
        if (p.freshness && !p.freshnessIndicator) {
            p.freshnessIndicator = getFreshnessIndicator(p.freshness);
        }
        
        // ✅ UPDATED: Show freshness badge even if only freshness value exists
        const freshnessBadge = p.freshness ? 
            `<div class="freshness-badge freshness-${p.freshnessIndicator || getFreshnessIndicator(p.freshness)}">
                ${getFreshnessEmoji(p.freshnessIndicator || getFreshnessIndicator(p.freshness))} ${p.freshness}% Fresh
            </div>` : '';
        
        // ✅ UPDATED: Show freshness meter
        const freshnessMeter = p.freshness ? 
            `<div class="freshness-meter mt-2">
                <div class="freshness-meter-fill level-${p.freshnessIndicator || getFreshnessIndicator(p.freshness)}" style="width: ${p.freshness}%"></div>
            </div>` : '';

        const isAdminViewing = window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin';
        const addButton = (isAdminViewing && !isPre)
            ? `<button class="px-3 py-1.5 rounded-md bg-lime-200 text-lime-800 text-sm cursor-not-allowed" disabled>View only</button>`
            : (!isPre ? `<button onclick="addToCart(${p.id},1)" class="px-3 py-1.5 rounded-md bg-lime-600 text-white text-sm">Add</button>` : 
                (isAdminViewing 
                    ? `<button class="px-3 py-1.5 rounded-md bg-yellow-200 text-yellow-800 text-sm cursor-not-allowed" disabled>View only</button>` 
                    : `<button onclick="preOrderItem(${p.id},1)" class="px-3 py-1.5 rounded-md bg-yellow-400 text-white text-sm">Pre-Order</button>`));
        
        return `
            <div class="card bg-white rounded-xl border p-3 flex flex-col">
                <div class="h-40 w-full rounded-md overflow-hidden bg-gray-50 relative">
                  <img src="${p.imgUrl}" alt="${p.name}" class="w-full h-full object-cover">
                  <div class="absolute top-3 left-3 flex flex-col gap-1">${preorderBadge}${freshnessBadge}</div>
                </div>
                <div class="mt-3 flex-1">
                  <div class="flex items-start justify-between gap-3">
                      <div>
                        <h3 class="font-semibold text-lg text-gray-800">${p.name}</h3>
                        <div class="text-sm text-gray-500">${p.origin} • <span class="font-medium">${p.farmer.name}</span></div>
                      </div>
                      <div class="text-right">
                        <div class="text-lime-700 font-extrabold text-lg">${formatPeso(p.price)}</div>
                        <div class="text-xs text-gray-500 text-right">${p.unit}</div>
                      </div>
                    </div>
                   ${freshnessMeter}
                   <div class="mt-3 flex items-center justify-between">
                        <div class="text-sm ${lowStock ? 'text-red-500' : 'text-gray-500'}">${p.quantity} ${p.unit}${p.quantity>1?'s':''} available</div>
                        <div class="flex items-center gap-2">
                          ${addButton}
                          <button onclick="showProduct(${p.id})" class="px-3 py-1.5 rounded-md bg-white border text-sm">Details</button>
                        </div>
                      </div>
                    </div>
                </div>
            `;
    }).join('') : `<div class="col-span-full text-center py-12 text-gray-500">
        ${window.APP_STATE.searchQuery ? 
            `No products found matching "<strong>${window.APP_STATE.searchQuery}</strong>"<br><button onclick="clearSearch()" class="mt-3 px-4 py-2 bg-lime-600 text-white rounded-lg">Clear Search</button>` : 
            'No products available.'
        }
    </div>`;

    return `
        <section>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold text-gray-800">Marketplace</h2>
            <div class="text-sm text-gray-500">Fresh products from local farms</div>
        </div>
        <div class="mobile-grid gap-6">
            ${grid}
        </div>
        </section>
    `;
};

window.showProduct = function(id) {
    const p = window.APP_STATE.products.find(x=>x.id===id);
    if(!p) return;

    const lowStock = p.quantity <= 5;
    const isPre = !!p.preorder;
    const rem = isPre ? computeRemainingDays(p) : null;
    const preorderBadge = isPre ? `<div class="badge bg-yellow-100 text-yellow-700 mb-2">🟡 Pre-Order • ${rem>0 ? rem + ' days left' : 'Ending'}</div>` : '';
    
    // ✅ UPDATED: Better freshness indicator logic
    const getFreshnessIndicator = (freshness) => {
        if (!freshness) return 'fresh';
        if (freshness >= 90) return 'farm-fresh';
        if (freshness >= 70) return 'very-fresh';
        if (freshness >= 50) return 'fresh';
        if (freshness >= 30) return 'good';
        return 'fair';
    };
    
    // ✅ Set freshness indicator if not already set
    if (p.freshness && !p.freshnessIndicator) {
        p.freshnessIndicator = getFreshnessIndicator(p.freshness);
    }
    
    // ✅ UPDATED: Freshness display with better fallback
    const freshnessBadge = p.freshness ? 
        `<div class="freshness-badge freshness-${p.freshnessIndicator || getFreshnessIndicator(p.freshness)} mb-2">
            ${getFreshnessEmoji(p.freshnessIndicator || getFreshnessIndicator(p.freshness))} ${p.freshness}% Fresh
        </div>` : '';
    
    const freshnessMeter = p.freshness ? 
        `<div class="mb-3">
            <div class="text-sm text-gray-600 mb-1">Freshness Level</div>
            <div class="freshness-meter">
                <div class="freshness-meter-fill level-${p.freshnessIndicator || getFreshnessIndicator(p.freshness)}" style="width: ${p.freshness}%"></div>
            </div>
            <div class="text-xs text-gray-500 mt-1">${p.freshness}% - ${(p.freshnessIndicator || getFreshnessIndicator(p.freshness)).replace('-', ' ').toUpperCase()}</div>
        </div>` : '';
    
    const isAdminViewing = window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin';

    let actionButton = '';
    if(!isAdminViewing) {
        if(isPre) {
            actionButton = `<button onclick="preOrderItem(${p.id},1)" class="px-4 py-2 bg-yellow-400 text-white rounded">Pre-Order</button>`;
        } else {
            actionButton = `<button onclick="addToCart(${p.id},1)" class="px-4 py-2 bg-lime-600 text-white rounded">Add to Cart</button>`;
        }
    }

    showModal(
        p.name,
        `
        <div class="grid gap-4">
            <div class="rounded overflow-hidden">
                <img src="${p.imgUrl}" alt="${p.name}" class="w-full h-48 object-cover rounded">
            </div>
            <div>
                ${preorderBadge}
                ${freshnessBadge}
                ${freshnessMeter}
                ${p.description ? `<div class="text-gray-700 text-sm mb-3 p-3 bg-gray-50 rounded border-l-4 border-lime-500">${p.description}</div>` : ''}
                <div class="text-gray-700 text-sm mb-1">${p.origin}</div>
                <div class="text-gray-500 text-sm mb-1">Farmer: <b>${p.farmer.name}</b> (${p.farmer.contact})</div>
                <div class="text-gray-700 text-sm mb-1">Price: <b>${formatPeso(p.price)}</b> / ${p.unit}</div>
                <div class="text-gray-700 text-sm mb-1">Stock: <b class="${lowStock?'text-red-500':''}">${p.quantity}</b> ${p.unit}${p.quantity>1?'s':''}</div>
                ${p.orderLimit ? `<div class="text-orange-600 text-sm font-semibold mb-1">⚠️ Max order: ${p.orderLimit} ${p.unit}${p.orderLimit > 1 ? 's' : ''} per customer</div>` : ''}
                ${isPre ? `<div class="text-yellow-600 text-sm">Pre-Order available in ${rem>0? rem : 0} day(s)</div>` : ''}
            </div>
        </div>
        `,
        `
        <button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>
        ${actionButton}
        `
    );
};

window.renderOrdersPublic = function() {
    let list = [];
    if(window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin') {
        list = window.APP_STATE.orders;
    } else if(window.APP_STATE.currentUser) {
        list = window.APP_STATE.orders.filter(o => o.email === window.APP_STATE.currentUser.email);
    } else {
        return `
        <section>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">Orders</h2>
                <div class="text-sm text-gray-500">Log in to see your orders</div>
            </div>
            <div class="bg-white rounded-xl p-6 border text-gray-600">Please <button onclick="openAuth('login')" class="underline">log in</button> or <button onclick="openAuth('signup')" class="underline">sign up</button> to view and track your orders.</div>
        </section>
        `;
    }

    if(window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'customer') {
        const html = list.length ? list.map(o => {
            const itemsHtml = o.items.map(it => `<li class="flex justify-between py-1"><span>${it.quantity} × ${it.name} (${it.unit})</span><span>${formatPeso(it.price * it.quantity)}</span></li>`).join('');
            return `
            <div class="bg-white rounded-xl p-4 border mb-3">
              <div class="flex items-center justify-between">
                <div><b>${o.id}</b> • ${o.customer}</div>
                <div class="text-lime-700 font-semibold">${formatPeso(o.total)}</div>
              </div>
              <div class="mt-2 text-sm text-gray-500">Date: ${o.date}</div>
              <div class="mt-3">
                <div class="font-medium">Items</div>
                <ul class="mt-2 border rounded p-3 bg-gray-50">
                  ${itemsHtml}
                </ul>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><b>Contact</b><br>${o.contact}</div>
                <div><b>Address</b><br>${o.address}</div>
              </div>
              <div class="mt-3">
                <div class="inline-flex items-center gap-3">
                  <div class="px-3 py-1 rounded bg-gray-100 text-gray-800">${o.status}</div>
                  <button onclick="viewOrderDetail('${o.id}')" class="px-3 py-1 rounded bg-white border text-sm">View</button>
                </div>
              </div>
            </div>
            `;
        }).join('') : `<div class="text-gray-500">You have no orders yet.</div>`;

        return `
        <section>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">My Orders</h2>
                <div class="text-sm text-gray-500">Order history & tracking</div>
            </div>
            ${html}
        </section>
        `;
    }

    const html = list.length ? list.map(o => `
    <div class="bg-white rounded-xl p-4 border mb-3">
        <div class="flex items-center justify-between">
          <div><b>${o.id}</b> • ${o.customer}</div>
          <div class="text-lime-700 font-semibold">${formatPeso(o.total)}</div>
        </div>
        <div class="text-sm text-gray-500 mt-2">Status: <span class="px-2 py-1 rounded bg-gray-100 text-gray-800">${o.status}</span></div>
        <div class="mt-2 text-sm">
          <button onclick="viewOrderDetail('${o.id}')" class="px-3 py-1 rounded bg-white border text-sm">View</button>
          ${window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin' ? `<button onclick="adminEditOrder('${o.id}')" class="px-3 py-1 rounded bg-lime-600 text-white text-sm ml-2">Update</button>` : ''}
        </div>
    </div>
    `).join('') : `<div class="text-gray-500">No orders to display.</div>`;

    return `
    <section>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold">Orders</h2>
            <div class="text-sm text-gray-500">Order history</div>
        </div>
        ${html}
    </section>
    `;
};

window.viewOrderDetail = function(id) {
    const o = window.APP_STATE.orders.find(x=> x.id === id);
    if(!o) return;
    const items = o.items.map(it => `<li class="flex justify-between py-1"><span>${it.quantity} × ${it.name} (${it.unit})</span><span>${formatPeso(it.price * it.quantity)}</span></li>`).join('');
    const actions = (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin') ? `<button onclick="adminEditOrder('${o.id}')" class="px-4 py-2 bg-lime-600 text-white rounded">Update Status</button>` : '';
    showModal(`Order ${o.id}`, `
    <div class="grid gap-2">
      <div><b>Customer:</b> ${o.customer}</div>
      <div><b>Contact:</b> ${o.contact}</div>
      <div><b>Address:</b> ${o.address}</div>
      <div><b>Date:</b> ${o.date}</div>
    <div class="pt-2"><b>Items</b><ul class="mt-2">${items}</ul></div>
    <div class="pt-2"><b>Total:</b> ${formatPeso(o.total)}</div>
    <div class="pt-2"><b>Status:</b> <span class="badge bg-gray-100 text-gray-800 px-2 py-1 rounded">${o.status}</span></div>
    </div>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>${actions}`);
};

window.renderAdminDashboard = async function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return `<div class="bg-white rounded-xl p-6 border">Admin access required.</div>`;
    
    const totalSales = window.APP_STATE.orders.filter(o => o.status === 'Delivered').reduce((s,o) => s + Number(o.total), 0);
    const pending = window.APP_STATE.orders.filter(o => o.status !== 'Delivered').length;

    const regular = window.APP_STATE.products.filter(p => !p.preorder);
    const preorderList = window.APP_STATE.products.filter(p => p.preorder);

    const usersData = await getFromFirebase('users');
    const pendingUsers = usersData ? Object.values(usersData).filter(u =>
        u.profile &&
        u.profile.fullName &&
        !u.profile.verified &&
        !u.profile.denied
    ) : [];

    const filteredRegular = filterProducts(regular);
    const filteredPreorder = filterProducts(preorderList);

    // ✅ CORRECTED: Regular Products Table Rows
const regularRows = filteredRegular.length > 0 ? filteredRegular.map(p => `
    <tr class="hover:bg-gray-50 border-b">
        <td class="px-3 py-2 text-sm">${p.name}</td>
        <td class="px-3 py-2 text-sm hidden sm:table-cell">${p.origin}</td>
        <td class="px-3 py-2 text-sm hidden md:table-cell">${p.farmer.name}</td>
        <td class="px-3 py-2 text-sm font-semibold">${formatPeso(p.price)}</td>
        <td class="px-3 py-2 text-sm">${p.quantity} ${p.unit}</td>
        <td class="px-3 py-2 text-sm hidden lg:table-cell">
            ${p.freshness ? `<span class="freshness-badge freshness-${p.freshnessIndicator || 'fresh'}">${getFreshnessEmoji(p.freshnessIndicator)} ${p.freshness}%</span>` : '<span class="text-gray-400">N/A</span>'}
        </td>
        <td class="px-3 py-2 text-sm text-right">
            <div class="flex flex-col sm:flex-row gap-1 justify-end">
                <button onclick="adminEditProduct(${p.id})" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">Edit</button>
                <button onclick="adminDeleteProduct(${p.id})" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
            </div>
        </td>
    </tr>
`).join('') : '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="7">No regular products</td></tr>';

// ✅ CORRECTED: Pre-Order Products Table Rows
const preorderRows = filteredPreorder.length > 0 ? filteredPreorder.map(p => {
    const rem = computeRemainingDays(p);
    return `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm">${p.name}</td>
            <td class="px-3 py-2 text-sm hidden sm:table-cell">${p.origin}</td>
            <td class="px-3 py-2 text-sm hidden md:table-cell">${p.farmer.name}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(p.price)}</td>
            <td class="px-3 py-2 text-sm">${p.quantity} ${p.unit}</td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">
                ${p.freshness ? `<span class="freshness-badge freshness-${p.freshnessIndicator || 'fresh'}">${getFreshnessEmoji(p.freshnessIndicator)} ${p.freshness}%</span>` : '<span class="text-gray-400">N/A</span>'}
            </td>
            <td class="px-3 py-2 text-sm">
                <span class="badge ${rem > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${rem > 0 ? `${rem} days left` : 'Ending'}</span>
            </td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminEditProduct(${p.id})" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">Edit</button>
                    <button onclick="adminDeleteProduct(${p.id})" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `;
}).join('') : '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="8">No pre-order products</td></tr>';

    // ✅ FILTER ORDERS
    // ✅ FILTER ORDERS - Reset search state when rendering dashboard
const regularOrders = window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order');
const preorderOrders = window.APP_STATE.orders.filter(o => o.type === 'pre-order');

// Show ALL orders by default when rendering
const filteredRegularOrders = regularOrders;
const filteredPreorderOrders = preorderOrders;

    const regularOrderRows = filteredRegularOrders.map(o => `
    <tr class="hover:bg-gray-50 border-b">
        <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
        <td class="px-3 py-2 text-sm">${o.customer}</td>
        <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
        <td class="px-3 py-2 text-sm">
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
                o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
                o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
                o.status === 'Attempt Delivery Failed' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
            }">${o.status}</span>
        </td>
        <td class="px-3 py-2 text-sm hidden lg:table-cell">${o.date}</td>
        <td class="px-3 py-2 text-sm text-right">
            <div class="flex flex-col sm:flex-row gap-1 justify-end">
                <button onclick="adminViewOrder('${o.id}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View</button>
                <button onclick="adminEditOrder('${o.id}')" class="px-2 py-1 text-xs bg-lime-600 text-white rounded hover:bg-lime-700">Update</button>
                <button onclick="adminDeleteOrder('${o.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
            </div>
        </td>
    </tr>
`).join('');

    const preorderOrderRows = filteredPreorderOrders.map(o => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
            <td class="px-3 py-2 text-sm">${o.customer}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
            <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
    o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
    o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
    o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
    o.status === 'Attempt Delivery Failed' ? 'bg-red-100 text-red-800' :
    'bg-orange-100 text-orange-800'
}">${o.status}</span>
            </td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">${o.date}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminViewOrder('${o.id}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View</button>
                    <button onclick="adminEditOrder('${o.id}')" class="px-2 py-1 text-xs bg-lime-600 text-white rounded hover:bg-lime-700">Update</button>
                    <button onclick="adminDeleteOrder('${o.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    // ✅ UPDATE SEARCH COUNTS
    setTimeout(() => {
        initializeOrderSearchListeners();
    }, 100);

    return `
    <section class="px-2 sm:px-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Admin Dashboard</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <button onclick="switchAdminView('verification')" class="px-3 py-2 bg-purple-600 text-white rounded text-sm sm:text-base hover:bg-purple-700">
            👤 User Verification
          </button>
          <button onclick="adminAddProduct()" class="px-3 py-2 bg-lime-600 text-white rounded text-sm sm:text-base hover:bg-lime-700">Add Product</button>
          <button onclick="adminUpdateDeliveryFee()" class="px-3 py-2 bg-blue-600 text-white rounded text-sm sm:text-base hover:bg-blue-700">Set Delivery Fee</button>
          <button onclick="viewDeleteLogs()" class="px-3 py-2 bg-white border text-gray-700 rounded text-sm sm:text-base hover:bg-gray-50">View Deletion Logs</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div class="bg-white rounded-xl p-4 shadow-sm border">
          <div class="text-sm text-gray-500">Total Sales (Delivered)</div>
          <div class="text-lg sm:text-xl font-bold text-lime-700 mt-1">${formatPeso(totalSales)}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm border">
          <div class="text-sm text-gray-500">Total Orders</div>
          <div class="text-lg sm:text-xl font-bold mt-1">${window.APP_STATE.orders.length}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-sm border">
          <div class="text-sm text-gray-500">Pending Orders</div>
          <div class="text-lg sm:text-xl font-bold mt-1">${pending}</div>
        </div>
      </div>

      ${pendingUsers.length > 0 ? `
        <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6 rounded-r-lg">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <i data-lucide="alert-circle" class="w-6 h-6 text-yellow-600"></i>
                    <div>
                        <h3 class="font-semibold text-yellow-800">Pending Profile Verifications</h3>
                        <p class="text-sm text-yellow-700">${pendingUsers.length} user${pendingUsers.length > 1 ? 's' : ''} waiting for verification</p>
                    </div>
                </div>
                <button onclick="switchAdminView('verification')" class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm font-semibold">
                    View All →
                </button>
            </div>
        </div>
      ` : ''}

      <div class="space-y-6">
        <!-- ✅ REGULAR PRODUCTS TABLE -->
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Products — Regular</h3>
              ${window.APP_STATE.searchQuery ? `<span class="text-sm text-gray-600">Showing ${filteredRegular.length} of ${regular.length}</span>` : ''}
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-700">
                <tr>
                  <th class="px-3 py-3 text-left font-medium">Name</th>
                  <th class="px-3 py-3 text-left font-medium hidden sm:table-cell">Origin</th>
                  <th class="px-3 py-3 text-left font-medium hidden md:table-cell">Farmer</th>
                  <th class="px-3 py-3 text-left font-medium">Price</th>
                  <th class="px-3 py-3 text-left font-medium">Stock</th>
                  <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Freshness</th>
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${regularRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ✅ PRE-ORDER PRODUCTS TABLE -->
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg">Products — Pre-Order</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-700">
                <tr>
                  <th class="px-3 py-3 text-left font-medium">Name</th>
                  <th class="px-3 py-3 text-left font-medium hidden sm:table-cell">Origin</th>
                  <th class="px-3 py-3 text-left font-medium hidden md:table-cell">Farmer</th>
                  <th class="px-3 py-3 text-left font-medium">Price</th>
                  <th class="px-3 py-3 text-left font-medium">Stock</th>
                  <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Freshness</th>
                  <th class="px-3 py-3 text-left font-medium">Time Left</th>
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${preorderRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- REGULAR ORDERS TABLE -->
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg mb-3">Orders — Regular</h3>
            
            <div class="order-search-section flex items-center gap-3">
              <div class="flex-1 relative">
                <i data-lucide="search" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input 
                  id="order-search-input" 
                  type="text" 
                  placeholder="Search by Order ID, Customer, Email, Contact, Status..." 
                  class="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
                  value=""
                />
                <button 
                  id="clear-order-search-btn" 
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hidden"
                  onclick="clearOrderSearch('regular')"
                >
                  <i data-lucide="x" class="w-5 h-5"></i>
                </button>
              </div>
              <button 
                id="clear-order-search-button"
                onclick="clearOrderSearch('regular')"
                class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Clear
              </button>
            </div>
            <div id="order-search-results-count" class="mt-2 text-sm text-gray-600"></div>
          </div>
          
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-700">
                <tr>
                  <th class="px-3 py-3 text-left font-medium">Order ID</th>
                  <th class="px-3 py-3 text-left font-medium">Customer</th>
                  <th class="px-3 py-3 text-left font-medium">Total</th>
                  <th class="px-3 py-3 text-left font-medium">Status</th>
                  <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Date</th>
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody id="regular-orders-tbody" class="divide-y divide-gray-200">
                ${regularOrderRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- PRE-ORDER ORDERS TABLE -->
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg mb-3">Orders — Pre-Order</h3>
            
            <div class="order-search-section flex items-center gap-3">
              <div class="flex-1 relative">
                <i data-lucide="search" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <input 
                  id="preorder-search-input" 
                  type="text" 
                  placeholder="Search by Order ID, Customer, Email, Contact, Status..." 
                  class="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
                  value=""
                />
                <button 
                  id="clear-preorder-search-btn" 
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hidden"
                  onclick="clearOrderSearch('preorder')"
                >
                  <i data-lucide="x" class="w-5 h-5"></i>
                </button>
              </div>
              <button 
                id="clear-preorder-search-button"
                onclick="clearOrderSearch('preorder')"
                class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Clear
              </button>
            </div>
            <div id="preorder-search-results-count" class="mt-2 text-sm text-gray-600"></div>
          </div>
          
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-700">
                <tr>
                  <th class="px-3 py-3 text-left font-medium">Order ID</th>
                  <th class="px-3 py-3 text-left font-medium">Customer</th>
                  <th class="px-3 py-3 text-left font-medium">Total</th>
                  <th class="px-3 py-3 text-left font-medium">Status</th>
                  <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Date</th>
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody id="preorder-orders-tbody" class="divide-y divide-gray-200">
                ${preorderOrderRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
`;
};

window.initializeOrderSearchListeners = function() {
    console.log('🔍 Initializing order search listeners...');
    
    // ===== REGULAR ORDERS SEARCH =====
    const orderSearchInput = document.getElementById('order-search-input');
    
    if (orderSearchInput) {
        console.log('✅ Found order search input');
        
        // Remove existing listeners by cloning
        const newOrderInput = orderSearchInput.cloneNode(true);
        orderSearchInput.parentNode.replaceChild(newOrderInput, orderSearchInput);
        
        // Set initial value to empty
        newOrderInput.value = '';
        
        // Debounced input handler
        const debouncedOrderSearch = debounce(function(query) {
            handleOrderSearch(query, 'regular');
        }, 300);
        
        newOrderInput.addEventListener('input', function(e) {
            debouncedOrderSearch(e.target.value);
        });
        
        // Prevent form submission
        newOrderInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') e.preventDefault();
        });
        
        // Initialize counts
        const regularOrders = window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order');
        updateOrderSearchResultsCount(regularOrders.length, regularOrders.length, 'regular');
    }
    
    // ===== PRE-ORDER ORDERS SEARCH =====
    const preorderSearchInput = document.getElementById('preorder-search-input');
    
    if (preorderSearchInput) {
        console.log('✅ Found preorder search input');
        
        // Remove existing listeners by cloning
        const newPreorderInput = preorderSearchInput.cloneNode(true);
        preorderSearchInput.parentNode.replaceChild(newPreorderInput, preorderSearchInput);
        
        // Set initial value to empty
        newPreorderInput.value = '';
        
        // Debounced input handler
        const debouncedPreorderSearch = debounce(function(query) {
            handleOrderSearch(query, 'preorder');
        }, 300);
        
        newPreorderInput.addEventListener('input', function(e) {
            debouncedPreorderSearch(e.target.value);
        });
        
        // Prevent form submission
        newPreorderInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') e.preventDefault();
        });
        
        // Initialize counts
        const preorderOrders = window.APP_STATE.orders.filter(o => o.type === 'pre-order');
        updateOrderSearchResultsCount(preorderOrders.length, preorderOrders.length, 'preorder');
    }
    
    // Initialize Lucide icons
    setTimeout(() => icons(), 50);
};


// NEW FUNCTION: Render User Verification Page
window.renderUserVerificationPage = async function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return `<div class="bg-white rounded-xl p-6 border">Admin access required.</div>`;
    }

    // Get all users with pending verification
    const usersData = await getFromFirebase('users');
const pendingUsers = usersData ? Object.values(usersData).filter(u =>
    u.profile &&
    u.profile.fullName &&
    !u.profile.verified &&        // not verified
    !u.profile.denied             // not denied
) : [];

    // Get verified users
    const verifiedUsers = usersData ? Object.values(usersData).filter(u => 
        u.profile && u.profile.verified
    ) : [];

    // Add after getting verifiedUsers (around line 1670):

// Get denied users
const deniedUsers = usersData ? Object.values(usersData).filter(u => 
    u.profile && u.profile.denied
) : [];

const deniedRows = deniedUsers.map(user => `
    <tr class="hover:bg-gray-50 border-b">
        <td class="px-3 py-2 text-sm font-medium">${user.profile.fullName}</td>
        <td class="px-3 py-2 text-sm hidden sm:table-cell">${user.email}</td>
        <td class="px-3 py-2 text-sm hidden md:table-cell">
            <div class="max-w-xs truncate text-red-700">${user.profile.denialReason || 'No reason'}</div>
        </td>
        <td class="px-3 py-2 text-sm hidden lg:table-cell">${user.profile.deniedAt ? new Date(user.profile.deniedAt).toLocaleDateString() : 'N/A'}</td>
        <td class="px-3 py-2 text-sm text-right">
            <button onclick="viewUserProfile('${user.uid}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View Details</button>
        </td>
    </tr>
`).join('');

    const pendingRows = pendingUsers.map(user => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-medium">${user.profile.fullName}</td>
            <td class="px-3 py-2 text-sm hidden sm:table-cell">${user.email}</td>
            <td class="px-3 py-2 text-sm hidden md:table-cell">${user.profile.idType || 'N/A'}</td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">${user.profile.submittedAt ? new Date(user.profile.submittedAt).toLocaleDateString() : 'N/A'}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="viewUserProfile('${user.uid}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View Details</button>
                    <button onclick="verifyCustomerProfile('${user.uid}')" class="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">✓ Verify</button>
                </div>
            </td>
        </tr>
    `).join('');

    const verifiedRows = verifiedUsers.map(user => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-medium">${user.profile.fullName}</td>
            <td class="px-3 py-2 text-sm hidden sm:table-cell">${user.email}</td>
            <td class="px-3 py-2 text-sm hidden md:table-cell">${user.profile.idType || 'N/A'}</td>
            <td class="px-3 py-2 text-sm hidden lg:table-cell">${user.profile.verifiedAt ? new Date(user.profile.verifiedAt).toLocaleDateString() : 'N/A'}</td>
            <td class="px-3 py-2 text-sm text-right">
                <button onclick="viewUserProfile('${user.uid}')" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">View Details</button>
            </td>
        </tr>
    `).join('');

    return `
        <section class="px-2 sm:px-4">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-800">User Verification</h2>
                <button onclick="switchAdminView('dashboard')" class="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                    ← Back to Dashboard
                </button>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                <div class="bg-white rounded-xl p-4 shadow-sm border">
                    <div class="text-sm text-gray-500">Pending Verifications</div>
                    <div class="text-lg sm:text-xl font-bold text-yellow-600 mt-1">${pendingUsers.length}</div>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border">
                    <div class="text-sm text-gray-500">Verified Users</div>
                    <div class="text-lg sm:text-xl font-bold text-green-600 mt-1">${verifiedUsers.length}</div>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm border">
                    <div class="text-sm text-gray-500">Total Users</div>
                    <div class="text-lg sm:text-xl font-bold mt-1">${pendingUsers.length + verifiedUsers.length}</div>
                </div>
                
<div class="bg-white rounded-xl p-4 shadow-sm border">
    <div class="text-sm text-gray-500">Denied Profiles</div>
    <div class="text-lg sm:text-xl font-bold text-red-600 mt-1">${deniedUsers.length}</div>
</div>
            </div>

            <!-- Pending Verifications Table -->
            ${pendingUsers.length > 0 ? `
                <div class="bg-white rounded-xl border overflow-hidden mb-6">
                    <div class="p-4 border-b bg-yellow-50">
                        <h3 class="font-semibold text-lg flex items-center gap-2">
                            <i data-lucide="alert-circle" class="w-5 h-5 text-yellow-600"></i>
                            Pending Verifications
                            <span class="ml-2 px-2 py-0.5 bg-yellow-500 text-white text-xs rounded-full">${pendingUsers.length}</span>
                        </h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 text-gray-700">
                                <tr>
                                    <th class="px-3 py-3 text-left font-medium">Customer Name</th>
                                    <th class="px-3 py-3 text-left font-medium hidden sm:table-cell">Email</th>
                                    <th class="px-3 py-3 text-left font-medium hidden md:table-cell">ID Type</th>
                                    <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Submitted</th>
                                    <th class="px-3 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                ${pendingRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : `
                <div class="bg-white rounded-xl p-6 border mb-6 text-center text-gray-500">
                    <i data-lucide="check-circle" class="w-12 h-12 mx-auto mb-2 text-green-500"></i>
                    <p class="font-semibold">No pending verifications</p>
                    <p class="text-sm">All users are verified!</p>
                </div>
            `}

            <!-- Verified Users Table -->
            <div class="bg-white rounded-xl border overflow-hidden">
                <div class="p-4 border-b bg-green-50">
                    <h3 class="font-semibold text-lg flex items-center gap-2">
                        <i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>
                        Verified Users
                        <span class="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">${verifiedUsers.length}</span>
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-gray-700">
                            <tr>
                                <th class="px-3 py-3 text-left font-medium">Customer Name</th>
                                <th class="px-3 py-3 text-left font-medium hidden sm:table-cell">Email</th>
                                <th class="px-3 py-3 text-left font-medium hidden md:table-cell">ID Type</th>
                                <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Verified Date</th>
                                <th class="px-3 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            ${verifiedRows || '<tr><td colspan="5" class="px-3 py-8 text-center text-gray-500">No verified users yet</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Add this before the closing </section> tag -->

<!-- Denied Profiles Table -->
${deniedUsers.length > 0 ? `
    <div class="bg-white rounded-xl border overflow-hidden">
        <div class="p-4 border-b bg-red-50">
            <h3 class="font-semibold text-lg flex items-center gap-2">
                <i data-lucide="x-circle" class="w-5 h-5 text-red-600"></i>
                Denied Profiles
                <span class="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">${deniedUsers.length}</span>
            </h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-700">
                    <tr>
                        <th class="px-3 py-3 text-left font-medium">Customer Name</th>
                        <th class="px-3 py-3 text-left font-medium hidden sm:table-cell">Email</th>
                        <th class="px-3 py-3 text-left font-medium hidden md:table-cell">Denial Reason</th>
                        <th class="px-3 py-3 text-left font-medium hidden lg:table-cell">Denied Date</th>
                        <th class="px-3 py-3 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${deniedRows}
                </tbody>
            </table>
        </div>
    </div>
` : ''}
        </section>
    `;
};

// NEW FUNCTION: Switch between admin dashboard views
window.switchAdminView = function(viewName) {
    if (!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    
    window.APP_STATE.adminView = viewName;
    renderMain();
};

window.toggleHowItWorks = function() {
    showModal('How Palengke.com Works', `
    <ol class="list-decimal pl-5 text-gray-700">
        <li>Sign in and enter your details to User Profile</li>
        <li>Wait for the verification of your profile.</li>
        <li>Add items to cart and proceed to checkout (COD). NOTE: NO CANCELATION</li>
        <li>Admin processes your order and prepares it for delivery.</li>
        <li>Delivery Rider delivers your order to your specified address.</li>
        <li>Receive your order and pay the rider in cash.</li>
        <li>Enjoy your fresh market goods!</li>
    </ol>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>`);
};

// Event Listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Main navigation
    const viewStore = document.getElementById('view-store');
    if (viewStore) {
        viewStore.addEventListener('click', () => switchTo('shop'));
    }
    
    const viewOrders = document.getElementById('view-orders');
    if (viewOrders) {
        viewOrders.addEventListener('click', () => switchTo('orders'));
    }
    
    const browseProducts = document.getElementById('browse-products');
    if (browseProducts) {
        browseProducts.addEventListener('click', () => switchTo('shop'));
    }
    
    const howItWorks = document.getElementById('how-it-works');
    if (howItWorks) {
        howItWorks.addEventListener('click', toggleHowItWorks);
    }
    
    // Mobile navigation
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    const mobileViewStore = document.getElementById('mobile-view-store');
    if (mobileViewStore) {
        mobileViewStore.addEventListener('click', () => switchTo('shop'));
    }
    
    const mobileViewOrders = document.getElementById('mobile-view-orders');
    if (mobileViewOrders) {
        mobileViewOrders.addEventListener('click', () => switchTo('orders'));
    }
    
    // Cart
    const cartBtn = document.getElementById('cart-btn');
if (cartBtn) {
    cartBtn.addEventListener('click', () => toggleCartDrawer());
}

// Cart close button - improved handling
const closeCart = document.getElementById('close-cart');
if (closeCart) {
    // Remove all existing event listeners by cloning
    const newCloseCart = closeCart.cloneNode(true);
    closeCart.parentNode.replaceChild(newCloseCart, closeCart);
    
    // Add single click handler
    newCloseCart.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const drawer = document.getElementById('cart-drawer');
        if (drawer) {
            drawer.classList.add('hidden');
        }
    });
}

// Close cart when clicking outside
document.addEventListener('click', function(e) {
    const cartDrawer = document.getElementById('cart-drawer');
    const cartBtn = document.getElementById('cart-btn');
    
    if (!cartDrawer || cartDrawer.classList.contains('hidden')) return;
    
    // Check if click is outside both cart drawer and cart button
    if (!cartDrawer.contains(e.target) && 
        !cartBtn.contains(e.target) && 
        e.target.id !== 'cart-btn') {
        cartDrawer.classList.add('hidden');
        console.log('✅ Cart closed (clicked outside)');
    }
});
    
    const checkoutBtn = document.getElementById('checkout-btn');
if (checkoutBtn) {
    // Remove any existing listeners by cloning
    const newCheckoutBtn = checkoutBtn.cloneNode(true);
    checkoutBtn.parentNode.replaceChild(newCheckoutBtn, checkoutBtn);
    
    // Add fresh listener
    newCheckoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Checkout button clicked');
        checkout();
    });
}
    
    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) hideModal();
        });
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        
        if (mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            closeMobileMenu();
        }
    });
    
    console.log('✅ Event listeners setup complete');
}

// Add BEFORE the closing brace of setupEventListeners()

// Close cart when clicking outside
document.addEventListener('click', function(e) {
    const cartDrawer = document.getElementById('cart-drawer');
    const cartBtn = document.getElementById('cart-btn');
    
    if (!cartDrawer || cartDrawer.classList.contains('hidden')) {
        return;
    }
    
    // Check if click is outside cart drawer and cart button
    if (!cartDrawer.contains(e.target) && !cartBtn.contains(e.target)) {
        console.log('👆 Clicked outside cart, closing...');
        toggleCartDrawer(false);
    }
});

// Auth state listener
// Auth state listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userData = await getFromFirebase(`users/${user.uid}`);
        if (userData) {
            window.APP_STATE.currentUser = {
                uid: user.uid,
                email: user.email,
                name: userData.name,
                role: userData.role
            };

            const userCart = await getFromFirebase(`carts/${user.uid}`);
            if (userCart) {
                const cartItems = Object.values(userCart).filter(item => 
                    item && typeof item === 'object' && item.productId
                );
                window.APP_STATE.cart = cartItems;
            }
            
            // ✅ Check for abandoned cart on login
            await checkAbandonedCartOnStartup();
        }
    } else {
        // ✅ Clear timer on logout
        if (cartActivityTimer) {
            clearTimeout(cartActivityTimer);
            cartActivityTimer = null;
        }
        
        window.APP_STATE.currentUser = null;
        window.APP_STATE.cart = [];
    }
    updateAuthArea();
    await renderMain();
});

// Initialize app
window.addEventListener('load', () => {
    initializeFirebaseData();
    setupEventListeners();
    updateAuthArea();
    icons();
});

// Escape key handler
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideModal();
        toggleCartDrawer(false); // ✅ Use function instead
        closeMobileMenu();
        closeUserMenu();
    }
});

// ✅ Ensure Browse Products Button Works
window.browsToShop = function() {
    window.APP_STATE.view = 'shop';
    window.APP_STATE.searchQuery = '';
    closeMobileMenu();
    renderMain();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ✅ Format Order ID consistently
window.formatOrderId = function(orderId) {
    // Ensure format is always O-XXXXXXXX
    if (!orderId.startsWith('O-')) {
        return 'O-' + orderId;
    }
    return orderId;
};

console.log('validateAndPlaceOrder exists:', typeof window.validateAndPlaceOrder);
console.log('CAINTA_BARANGAYS:', CAINTA_BARANGAYS);
