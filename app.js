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
    cloudinaryConfig 
} from './firebase-config.js';

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
    view: 'shop'
};

const APP_KEY = 'palengke_cainta_v4';

const dbRefs = {
    products: ref(database, 'products'),
    orders: ref(database, 'orders'),
    users: ref(database, 'users'),
    carts: ref(database, 'carts'),
    notifications: ref(database, 'notifications'),
    deleteLogs: ref(database, 'deleteLogs')
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
    
    mobileMenu.classList.toggle('hidden');
    mobileMenu.classList.toggle('active');
    
    // Update icon
    const icon = mobileMenuBtn.querySelector('i');
    if (mobileMenu.classList.contains('hidden')) {
        icon.setAttribute('data-lucide', 'menu');
    } else {
        icon.setAttribute('data-lucide', 'x');
    }
    lucide.createIcons();
};

window.closeMobileMenu = function() {
    const mobileMenu = document.getElementById("mobile-menu");
    if (mobileMenu) {
      mobileMenu.setAttribute("aria-hidden", "true");
      mobileMenu.classList.remove("active");
      document.body.classList.remove("mobile-menu-open");
    }
  };
  

// Enhanced User Menu Functionality for Mobile
function setupMobileUserMenu() {
    const userMenu = document.getElementById('user-menu');
    const userMenuBtn = document.getElementById('user-menu-btn');
    
    if (!userMenu || !userMenuBtn) return;

    // Create overlay if it doesn't exist
    let userMenuOverlay = document.getElementById('user-menu-overlay');
    if (!userMenuOverlay) {
        userMenuOverlay = document.createElement('div');
        userMenuOverlay.id = 'user-menu-overlay';
        userMenuOverlay.className = 'user-menu-overlay';
        document.body.appendChild(userMenuOverlay);
    }

    // Toggle user menu
    userMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            userMenu.classList.toggle('active');
            userMenuOverlay.classList.toggle('active');
            document.body.classList.toggle('user-menu-open');
        } else {
            userMenu.classList.toggle('active');
        }
    });

    // Close user menu when clicking overlay (mobile)
    userMenuOverlay.addEventListener('click', function() {
        userMenu.classList.remove('active');
        userMenuOverlay.classList.remove('active');
        document.body.classList.remove('user-menu-open');
    });

    // Close user menu when clicking outside (desktop)
    document.addEventListener('click', function(e) {
        if (userMenu.classList.contains('active') && 
            !userMenu.contains(e.target) && 
            !userMenuBtn.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });

    // Close user menu when resizing to desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && userMenuOverlay.classList.contains('active')) {
            userMenuOverlay.classList.remove('active');
            document.body.classList.remove('user-menu-open');
        }
    });

    // Close user menu when menu items are clicked
    const menuItems = userMenu.querySelectorAll('.user-menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            userMenu.classList.remove('active');
            userMenuOverlay.classList.remove('active');
            document.body.classList.remove('user-menu-open');
        });
    });
}

async function initializeFirebaseData() {
    try {
        const productsData = await getFromFirebase('products');
        if (productsData) {
            window.APP_STATE.products = Object.values(productsData);
        } else {
            await seedInitialData();
        }

        const ordersData = await getFromFirebase('orders');
        if (ordersData) {
            window.APP_STATE.orders = Object.values(ordersData);
        }

        setupRealtimeListeners();
        
        updatePreorderStatuses();
        renderMain();
    } catch (error) {
        console.error('Error initializing Firebase data:', error);
    }
}

async function seedInitialData() {
    const initialProducts = [
        { id: 1, name: "Fresh Tilapia", origin: "San Juan Fish Farm", farmer: { name: "Mang Jose", contact: "0917-234-5678" }, price: 150.00, quantity: 50, unit: 'kg', imgUrl: 'https://placehold.co/600x360/4ade80/000?text=Tilapia' },
        { id: 2, name: "Native Chicken Eggs", origin: "Brgy. San Andres Poultry", farmer: { name: "Aling Nena", contact: "0998-765-4321" }, price: 8.00, quantity: 200, unit: 'pc', imgUrl: 'https://placehold.co/600x360/84cc16/000?text=Eggs' },
        { id: 3, name: "Organic Lettuce", origin: "Sta. Lucia Hydroponics", farmer: { name: "Mr. Dela Cruz", contact: "0920-111-2222" }, price: 65.00, quantity: 30, unit: 'head', imgUrl: 'https://placehold.co/600x360/4ade80/000?text=Lettuce' },
        { id: 4, name: "Ripe Bananas (Lakatan)", origin: "Cainta Farm Cooperative", farmer: { name: "Ate Sol", contact: "0905-333-4444" }, price: 50.00, quantity: 80, unit: 'kg', imgUrl: 'https://placehold.co/600x360/84cc16/000?text=Bananas' },
    ];

    for (const product of initialProducts) {
        await saveToFirebase(`products/${product.id}`, product);
    }
    window.APP_STATE.products = initialProducts;

    await createDefaultAdmin();
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
        console.log("Default admin account created successfully");
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log("Admin account already exists");
        } else {
            console.error("Error creating admin account:", error);
        }
    }
}

function setupRealtimeListeners() {
    onValue(dbRefs.products, (snapshot) => {
        if (snapshot.exists()) {
            window.APP_STATE.products = Object.values(snapshot.val());
            if (window.APP_STATE.view === 'shop' || (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin' && window.APP_STATE.view === 'admin')) {
                renderMain();
            }
        }
    });

    onValue(dbRefs.orders, (snapshot) => {
        if (snapshot.exists()) {
            window.APP_STATE.orders = Object.values(snapshot.val());
            if (window.APP_STATE.view === 'orders' || (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'admin' && window.APP_STATE.view === 'admin')) {
                renderMain();
            }
        }
    });
}

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

        const userData = {
            uid: user.uid,
            email: email,
            name: name,
            contact: contact,
            role: 'customer',
            createdAt: new Date().toISOString()
        };

        await saveToFirebase(`users/${user.uid}`, userData);

        window.APP_STATE.currentUser = {
            uid: user.uid,
            email: email,
            name: name,
            role: 'customer'
        };

        hideModal();
        updateAuthArea();
        renderMain();
        showModal('Welcome!', `Account created and logged in as <b>${name}</b>.`, `<button onclick="hideModal(); renderMain()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'An error occurred during signup.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please try logging in.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        }

        showModal('Signup Error', errorMessage, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.loginUser = async function() {
    const email = document.getElementById('login-email')?.value?.trim()?.toLowerCase();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        return showModal('Missing fields', 'Please fill both email and password.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

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
                window.APP_STATE.cart = Object.values(userCart);
            }

            hideModal();
            updateAuthArea();
            renderMain();

            const notifications = await getFromFirebase('notifications');
            if (notifications) {
                const userNotifications = Object.values(notifications).filter(n => n.to === window.APP_STATE.currentUser.email);
                if (userNotifications.length > 0) {
                    const msgs = userNotifications.map(n => `<div class="py-2"><b>${n.date}</b><div>${n.message}</div></div>`).join('');
                    showModal('Notifications', `<div class="max-h-64 overflow-auto">${msgs}</div>`, `<button onclick="hideModal();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
                    
                    for (const notification of userNotifications) {
                        await remove(ref(database, `notifications/${notification.id}`));
                    }
                } else {
                    showModal('Logged in', `Welcome back, <b>${window.APP_STATE.currentUser.name}</b>!`, `<button onclick="hideModal(); renderMain()" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
                }
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Invalid email or password.';

        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        }

        showModal('Login Error', errorMessage, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
};

window.logoutUser = async function() {
    try {
        if (window.APP_STATE.currentUser && window.APP_STATE.currentUser.role === 'customer') {
            await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
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
    if (p.quantity <= 0) return showModal('Out of stock', `${p.name} is out of stock.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);

    const idx = window.APP_STATE.cart.findIndex(c => c.productId === productId && !c.preordered);
    if (idx >= 0) {
        if (p.quantity < qty) return showModal('Not enough stock', `Only ${p.quantity} ${p.unit} left in stock.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-200 rounded">OK</button>`);
        window.APP_STATE.cart[idx].quantity += qty;
    } else {
        window.APP_STATE.cart.push({ productId: p.id, name: p.name, price: p.price, quantity: qty, unit: p.unit, preordered: false });
    }

    p.quantity = Math.max(0, p.quantity - qty);
    await updateFirebase(`products/${p.id}`, { quantity: p.quantity });

    await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);

    renderCartDrawer();
    toggleCartDrawer(true);
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
    if(newQty <= 0) return removeCartItem(pid);
    const oldQty = window.APP_STATE.cart[idx].quantity;
    const diff = newQty - oldQty;
    const product = window.APP_STATE.products.find(p=> p.id === pid);
    if(diff > 0 && product && product.quantity < diff) {
        return showModal('Not enough stock', `Only ${product.quantity} ${product.unit} left in stock.`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }
    if(product) product.quantity = Math.max(0, product.quantity - diff * 1 * (diff > 0 ? 1 : -1));
    window.APP_STATE.cart[idx].quantity = newQty;
    saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
    updateFirebase(`products/${pid}`, { quantity: product.quantity });
    renderCartDrawer();
    renderMain();
};

window.removeCartItem = async function(pid) {
    const idx = window.APP_STATE.cart.findIndex(c=> c.productId === pid);
    if(idx === -1) return;
    const item = window.APP_STATE.cart[idx];
    const product = window.APP_STATE.products.find(p=> p.id === pid);
    if(product) {
        product.quantity += item.quantity;
        await updateFirebase(`products/${pid}`, { quantity: product.quantity });
    }
    window.APP_STATE.cart.splice(idx,1);
    await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);
    renderCartDrawer();
    renderMain();
};

window.checkout = function() {
    if(window.APP_STATE.cart.length === 0) {
        return showModal('Cart is empty', 'Please add items to your cart first.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    }

    if(!window.APP_STATE.currentUser){
        return showModal('Login required', 'Please log in or create an account to place your order.', `<button onclick="hideModal(); openAuth('login')" class="px-4 py-2 bg-lime-600 text-white rounded">Log in</button><button onclick="hideModal(); openAuth('signup')" class="px-4 py-2 bg-white border rounded">Sign up</button>`);
    }
    const subtotal = window.APP_STATE.cart.reduce((s,i)=> s + i.price * i.quantity, 0);
    showModal('Checkout', `
    <div>
      <div class="text-sm text-gray-600 mb-3">Order total: <span class="font-bold text-lime-700">${formatPeso(subtotal)}</span></div>
      <form id="checkout-form" class="grid gap-3">
        <input id="customer-name" value="${window.APP_STATE.currentUser.name}" required placeholder="Full name" class="p-2 border rounded" />
        <input id="customer-contact" value="${(window.APP_STATE.currentUser.contact)||''}" required placeholder="Contact number (09XX-XXX-XXXX)" class="p-2 border rounded" />
        <textarea id="customer-address" required placeholder="unit number, building name, street, city, region, zip code" class="p-2 border rounded"></textarea>
        <div class="text-sm text-gray-500">Payment: Cash on Delivery (COD)</div>
      </form>
    </div>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
    <button onclick="placeOrder()" class="px-4 py-2 bg-lime-600 text-white rounded">Place Order</button>`);
};

window.placeOrder = async function() {
    const name = document.getElementById('customer-name')?.value?.trim();
    const contact = document.getElementById('customer-contact')?.value?.trim();
    const address = document.getElementById('customer-address')?.value?.trim();
    if(!name || !contact || !address) return showModal('Missing info', 'Please fill all checkout fields', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const newId = 'O-' + uid();
    const itemsCopy = window.APP_STATE.cart.map(i=> ({ ...i }));
    const total = itemsCopy.reduce((s,i)=> s + i.price * i.quantity, 0);
    const isPreorderOrder = itemsCopy.some(it => it.preordered === true);
    const newOrder = { id: newId, items: itemsCopy, total, status: isPreorderOrder ? 'Pre-Order Received' : 'Preparing Order', type: isPreorderOrder ? 'pre-order' : 'regular', customer: name, email: window.APP_STATE.currentUser.email, contact, address, date: new Date().toLocaleString(), userId: window.APP_STATE.currentUser.uid };

    await saveToFirebase(`orders/${newId}`, newOrder);

    window.APP_STATE.cart = [];
    await saveToFirebase(`carts/${window.APP_STATE.currentUser.uid}`, window.APP_STATE.cart);

    toggleCartDrawer(false);
    hideModal();
    showModal('Order Placed!', `<div class="text-gray-700">Thank you <b>${name}</b>! Your order <b>${newId}</b> for <b>${formatPeso(total)}</b> has been received.</div>`, `<button onclick="hideModal(); switchTo('orders'); renderMain();" class="px-4 py-2 bg-lime-600 text-white rounded">OK</button>`);
    renderMain();
};

window.adminAddProduct = function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);

    showModal('Add New Product', `
    <form id="product-form" class="grid gap-3">
    <input id="p-name" placeholder="Product name" class="p-2 border rounded" />
    <div class="grid grid-cols-3 gap-2">
        <input id="p-price" type="number" step="0.01" placeholder="Price (₱)" class="p-2 border rounded col-span-1" />
        <input id="p-qty" type="number" placeholder="Quantity" class="p-2 border rounded" />
        <select id="p-unit" class="p-2 border rounded">
          <option value="kg">kg</option>
          <option value="pc">pc</option>
          <option value="bundle">Bundle</option>
        </select>
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
            <div id="freshness-bar" class="freshness-bar" style="width: 100%"></div>
        </div>
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
    <div class="flex items-center gap-3">
        <label class="flex items-center gap-2"><input id="p-preorder" type="checkbox"/> <span class="text-sm">Pre-Order</span></label>
        <input id="p-preorder-duration" type="number" min="7" max="14" placeholder="Duration (7-14 days)" class="p-2 border rounded w-48" />
    </div>
    </form>
    `, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Cancel</button>
        <button onclick="adminSaveProduct()" class="px-4 py-2 bg-lime-600 text-white rounded">Create</button>`);

    setTimeout(() => updateFreshnessDisplay(100), 100);
};

window.adminSaveProduct = async function(editId = null) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') {
        return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="btn btn-secondary">OK</button>`);
    }
    
    const name = document.getElementById('p-name')?.value?.trim();
    const price = parseFloat(document.getElementById('p-price')?.value);
    const qty = parseInt(document.getElementById('p-qty')?.value);
    const unit = document.getElementById('p-unit')?.value?.trim();
    const origin = document.getElementById('p-origin')?.value?.trim();
    const farmer = document.getElementById('p-farmer')?.value?.trim();
    const contact = document.getElementById('p-contact')?.value?.trim();
    const fileInput = document.getElementById('p-img-file');
    const preview = document.getElementById('p-img-preview');

    if(!name || isNaN(price) || isNaN(qty) || !unit || !origin || !farmer || !contact){
        return showModal('Missing fields', 'Please fill all product fields correctly.', `<button onclick="hideModal()" class="btn btn-secondary">OK</button>`);
    }

    let imgUrl = '';
    
    // Handle image upload
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
        // Use placeholder
        imgUrl = `https://placehold.co/600x360/4ade80/ffffff?text=${encodeURIComponent(name || 'Product')}`;
        console.log('Using placeholder image:', imgUrl);
    }

    const isPre = document.getElementById('p-preorder')?.checked;
    const dur = parseInt(document.getElementById('p-preorder-duration')?.value) || null;
    
    if(editId){
        const productUpdate = { name, price, quantity: qty, unit, origin, farmer: { name: farmer, contact }, imgUrl: imgUrl };
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
    } else {
        const newId = Date.now();
        const newProd = { id: newId, name, price, quantity: qty, unit, origin, farmer: { name: farmer, contact }, imgUrl: imgUrl };
        if(isPre){
            newProd.preorder = true;
            newProd.preorderDuration = Math.min(14, Math.max(7, (dur || 7)));
            newProd.preorderStart = Date.now();
        }
        await saveToFirebase(`products/${newId}`, newProd);
    }
    hideModal();
};

window.adminEditProduct = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const p = window.APP_STATE.products.find(x=> x.id === id);
    if(!p) return;
 
    showModal('Edit Product', `
    <form id="product-form" class="grid gap-3">
    <input id="p-name" value="${p.name}" placeholder="Product name" class="p-2 border rounded" />
    <div class="grid grid-cols-3 gap-2">
        <input id="p-price" type="number" step="0.01" value="${p.price}" placeholder="Price (₱)" class="p-2 border rounded col-span-1" />
        <input id="p-qty" type="number" value="${p.quantity}" placeholder="Quantity" class="p-2 border rounded" />
        <select id="p-unit" class="p-2 border rounded">
          <option value="kg" ${p.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="pc" ${p.unit === 'pc' ? 'selected' : ''}>pc</option>
          <option value="bundle" ${p.unit === 'bundle' ? 'selected' : ''}>Bundle</option>
        </select>
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
    const prodToDelete = window.APP_STATE.products.find(p => p.id === id);
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
    await remove(ref(database, `products/${id}`));
    hideModal();
};

window.adminViewOrder = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const o = window.APP_STATE.orders.find(x=> x.id === id);
    if(!o) return;
    const items = o.items.map(it => `<li class="flex justify-between"><span>${it.quantity} × ${it.name} (${it.unit})</span><span>${formatPeso(it.price * it.quantity)}</span></li>`).join('');
    showModal(`Order ${o.id}`, `
    <div class="grid gap-2">
      <div><b>Customer:</b> ${o.customer}</div>
      <div><b>Email:</b> ${o.email || ''}</div>
      <div><b>Contact:</b> ${o.contact}</div>
      <div><b>Address:</b> ${o.address}</div>
      <div><b>Date:</b> ${o.date}</div>
    <div class="pt-2"><b>Items</b><ul class="mt-2">${items}</ul></div>
    <div class="pt-2"><b>Total:</b> ${formatPeso(o.total)}</div>
    <div class="pt-2"><b>Status:</b> <span class="badge bg-gray-100 text-gray-800 px-2 py-1 rounded">${o.status}</span></div>
    </div>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button><button onclick="adminEditOrder('${o.id}')" class="px-4 py-2 bg-lime-600 text-white rounded">Update Status</button>`);
};

window.adminEditOrder = function(id) {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return showModal('Forbidden', 'Admin access required.', `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">OK</button>`);
    const o = window.APP_STATE.orders.find(x=> x.id === id);
    if(!o) return;
    const statuses = ['Preparing Order', 'Ready to Deliver', 'Out for Delivery', 'Delivered'];
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
window.uid = function(){ return Date.now().toString().slice(-8); };

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

window.icons = function(){ if(window.lucide) lucide.createIcons(); };

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
          <div class="mt-4 text-gray-700">${contentHtml}</div>
        </div>
        <div class="bg-gray-50 p-4 flex justify-end gap-3">
          ${actionsHtml}
        </div>
    `;
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    icons();
};

window.hideModal = function(){ 
    document.getElementById('modal-overlay').classList.add('hidden'); 
    document.getElementById('modal-overlay').style.display = 'none'; 
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
            <div class="relative">
                <button id="user-menu-btn" class="user-dropdown-trigger">
                  <i data-lucide="user" class="w-4 h-4 text-gray-700"></i>
                  <span class="text-sm font-medium hidden-mobile">${window.APP_STATE.currentUser.name}</span>
                  <i data-lucide="chevron-down" class="w-4 h-4 text-gray-500"></i>
                </button>
                <div id="user-menu" class="user-menu">
                  ${window.APP_STATE.currentUser.role === 'admin' ? 
                    `<button onclick="goAdmin()" class="user-menu-item">
                      <i data-lucide="settings" class="w-4 h-4"></i>
                      Admin Dashboard
                    </button>` : 
                    `<button onclick="switchTo('orders'); hideUserMenu();" class="user-menu-item">
                      <i data-lucide="package" class="w-4 h-4"></i>
                      My Orders
                    </button>`
                  }
                  <button onclick="logoutUser()" class="user-menu-item logout">
                    <i data-lucide="log-out" class="w-4 h-4"></i>
                    Logout
                  </button>
                </div>
            </div>
        `;

        // Mobile auth area
        if(mobileAuthArea) {
            mobileAuthArea.innerHTML = `
                <div class="user-menu-info">
                  <div class="font-semibold">${window.APP_STATE.currentUser.name}</div>
                  <div class="text-sm">${window.APP_STATE.currentUser.email}</div>
                </div>
                ${window.APP_STATE.currentUser.role === 'admin' ? 
                  `<button onclick="goAdmin(); closeMobileMenu();" class="mobile-nav-item">
                    <i data-lucide="settings" class="w-5 h-5"></i>
                    Admin Dashboard
                  </button>` : 
                  `<button onclick="switchTo('orders'); closeMobileMenu();" class="mobile-nav-item">
                    <i data-lucide="package" class="w-5 h-5"></i>
                    My Orders
                  </button>`
                }
                <button onclick="logoutUser(); closeMobileMenu();" class="mobile-nav-item" style="color: #dc2626;">
                  <i data-lucide="log-out" class="w-5 h-5"></i>
                  Logout
                </button>
            `;
        }

        headerActions.innerHTML = `
            <button id="header-logout" onclick="logoutUser()" class="btn-ghost hidden-mobile">Logout</button>
            ${window.APP_STATE.currentUser.role === 'admin' && window.APP_STATE.view === 'admin' ? 
                `<button id="exit-admin-btn" onclick="exitAdmin()" class="btn-ghost hidden-mobile">Exit Admin</button>` : ''}
        `;
        
        // Initialize mobile user menu functionality
        setTimeout(setupMobileUserMenu, 100);
    } else {
        container.innerHTML = `
            <div class="flex gap-2">
                <button onclick="openAuth('login')" class="px-3 py-2 rounded-lg bg-white border text-gray-700">Log in</button>
                <button onclick="openAuth('signup')" class="px-3 py-2 rounded-lg bg-lime-600 text-white">Sign up</button>
            </div>
        `;

        // Mobile auth area
        if(mobileAuthArea) {
            mobileAuthArea.innerHTML = `
                <div class="flex flex-col gap-2">
                    <button onclick="openAuth('login'); closeMobileMenu();" class="px-3 py-2 rounded-lg bg-white border text-gray-700">Log in</button>
                    <button onclick="openAuth('signup'); closeMobileMenu();" class="px-3 py-2 rounded-lg bg-lime-600 text-white">Sign up</button>
                </div>
            `;
        }

        headerActions.innerHTML = '';
    }
    icons();
};

window.openAuth = function(mode = 'login') {
    if(mode === 'login') {
        showModal('Log in', `
        <form id="login-form" class="grid gap-3">
            <input id="login-email" type="email" placeholder="Email" class="p-2 border rounded" required />
            <input id="login-password" type="password" placeholder="Password" class="p-2 border rounded" required />
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
    renderMain();
    hideUserMenu();
};

window.goAdmin = function() {
    window.APP_STATE.view = 'admin';
    renderMain();
    hideUserMenu();
};

window.hideUserMenu = function() {
    const menu = document.getElementById('user-menu');
    const overlay = document.getElementById('user-menu-overlay');
    if(menu) menu.classList.remove('active');
    if(overlay) overlay.classList.remove('active');
    document.body.classList.remove('user-menu-open');
};

window.toggleCartDrawer = function(show) {
    const drawer = document.getElementById('cart-drawer');
    if (typeof show === 'boolean') {
        drawer.classList.toggle('hidden', !show);
    } else {
        drawer.classList.toggle('hidden');
    }
    renderCartDrawer();
};

window.updateCartBadge = function() {
    const cnt = window.APP_STATE.cart.reduce((s,i)=>s + Number(i.quantity), 0);
    document.getElementById('cart-badge').textContent = cnt;
};

window.renderCartDrawer = function() {
    const body = document.getElementById('cart-drawer-body');
    if (!body) return;
    if (window.APP_STATE.cart.length === 0) {
        body.innerHTML = `<div class="text-center py-12 text-gray-500">Your cart is empty — add fresh products from the shop.</div>`;
        document.getElementById('cart-subtotal').textContent = formatPeso(0);
        updateCartBadge();
        icons();
        return;
     }
    const itemsHtml = window.APP_STATE.cart.map(it => {
        return `
            <div class="flex items-center gap-3 py-3 border-b">
                <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="${(window.APP_STATE.products.find(p => p.id === it.productId) || {imgUrl:''}).imgUrl}" alt="${it.name}" class="object-cover w-full h-full">
                  </div>
                <div class="flex-1">
                  <div class="font-medium text-gray-800">${it.name}</div>
                  <div class="text-sm text-gray-500">${it.quantity} x ${formatPeso(it.price)} / ${it.unit}</div>
                  </div>
                <div class="text-right">
                  <div class="font-semibold text-gray-800">${formatPeso(it.price * it.quantity)}</div>
                  <div class="flex gap-1 mt-2 justify-end">
                    <button onclick="changeCartItem(${it.productId}, ${it.quantity - 1})" class="px-2 py-1 rounded-md text-sm bg-gray-100">-</button>
                    <button onclick="changeCartItem(${it.productId}, ${it.quantity + 1})" class="px-2 py-1 rounded-md text-sm bg-gray-100">+</button>
                    <button onclick="removeCartItem(${it.productId})" class="px-2 py-1 rounded-md text-sm bg-red-50 text-red-600">Remove</button>
                  </div>
                 </div>
            </div>
        `;
    }).join('');
    body.innerHTML = itemsHtml;
    const subtotal = window.APP_STATE.cart.reduce((s,i)=> s + (i.price * i.quantity), 0);
    document.getElementById('cart-subtotal').textContent = formatPeso(subtotal);
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

window.renderMain = function() {
    const main = document.getElementById('main-content');
    updateAuthArea();

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
        main.innerHTML = renderAdminDashboard();
    } else {
        if(window.APP_STATE.view === 'shop') main.innerHTML = renderShop();
        else main.innerHTML = renderOrdersPublic();
    }
    icons();
    updateCartBadge();
    renderCartDrawer();
};

window.switchTo = function(v) {
    window.APP_STATE.view = v;
    closeMobileMenu();
    renderMain();
};

window.renderShop = function() {
    const grid = window.APP_STATE.products.length ? window.APP_STATE.products.map(p => {
        const lowStock = p.quantity <= 5;
        const isPre = !!p.preorder;
        const rem = isPre ? computeRemainingDays(p) : null;
        const badgeHtml = isPre ? `<div class="badge bg-yellow-100 text-yellow-700">🟡 Pre-Order • ${rem>0? rem + ' days left' : 'Ending'}</div>` : '';

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
                  <div class="absolute top-3 left-3">${badgeHtml}</div>
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
    }).join('') : `<div class="col-span-full text-center py-12 text-gray-500">No products available.</div>`;

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
    const badgeHtml = isPre ? `<div class="badge bg-yellow-100 text-yellow-700 mb-2">🟡 Pre-Order • ${rem>0 ? rem + ' days left' : 'Ending'}</div>` : '';
    
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
                ${badgeHtml}
                <div class="text-gray-700 text-sm mb-1">${p.origin}</div>
                <div class="text-gray-500 text-sm mb-1">Farmer: <b>${p.farmer.name}</b> (${p.farmer.contact})</div>
                <div class="text-gray-700 text-sm mb-1">Price: <b>${formatPeso(p.price)}</b> / ${p.unit}</div>
                <div class="text-gray-700 text-sm mb-1">Stock: <b class="${lowStock?'text-red-500':''}">${p.quantity}</b> ${p.unit}${p.quantity>1?'s':''}</div>
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

window.renderAdminDashboard = function() {
    if(!window.APP_STATE.currentUser || window.APP_STATE.currentUser.role !== 'admin') return `<div class="bg-white rounded-xl p-6 border">Admin access required.</div>`;
    const totalSales = window.APP_STATE.orders.filter(o => o.status === 'Delivered').reduce((s,o) => s + Number(o.total), 0);
    const pending = window.APP_STATE.orders.filter(o => o.status !== 'Delivered').length;
    const stockValue = window.APP_STATE.products.reduce((s,p) => s + (p.price * p.quantity), 0);

    const regular = window.APP_STATE.products.filter(p => !p.preorder);
    const preorderList = window.APP_STATE.products.filter(p => p.preorder);

    const regularRows = regular.map(p => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm">${p.name}</td>
            <td class="px-3 py-2 text-sm hidden sm:table-cell">${p.origin}</td>
            <td class="px-3 py-2 text-sm hidden md:table-cell">${p.farmer.name}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(p.price)}</td>
            <td class="px-3 py-2 text-sm">${p.quantity} ${p.unit}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminEditProduct(${p.id})" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">Edit</button>
                    <button onclick="adminDeleteProduct(${p.id})" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    const preorderRows = preorderList.map(p => {
        const rem = computeRemainingDays(p);
        return `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm">${p.name}</td>
            <td class="px-3 py-2 text-sm hidden sm:table-cell">${p.origin}</td>
            <td class="px-3 py-2 text-sm hidden md:table-cell">${p.farmer.name}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(p.price)}</td>
            <td class="px-3 py-2 text-sm">${p.quantity} ${p.unit}</td>
            <td class="px-3 py-2 text-sm ${rem <= 3 ? 'text-red-600 font-semibold' : 'text-yellow-600'}">${rem>0? rem + ' days' : 'Ending'}</td>
            <td class="px-3 py-2 text-sm text-right">
                <div class="flex flex-col sm:flex-row gap-1 justify-end">
                    <button onclick="adminEditProduct(${p.id})" class="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">Edit</button>
                    <button onclick="adminDeleteProduct(${p.id})" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    const regularOrders = window.APP_STATE.orders.filter(o => !o.type || o.type !== 'pre-order');
    const preorderOrders = window.APP_STATE.orders.filter(o => o.type === 'pre-order');

    const regularOrderRows = regularOrders.map(o => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
            <td class="px-3 py-2 text-sm">${o.customer}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
            <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
                    o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                    o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
                    o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
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

    const preorderOrderRows = preorderOrders.map(o => `
        <tr class="hover:bg-gray-50 border-b">
            <td class="px-3 py-2 text-sm font-mono">${o.id}</td>
            <td class="px-3 py-2 text-sm">${o.customer}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatPeso(o.total)}</td>
            <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${
                    o.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                    o.status === 'Out for Delivery' ? 'bg-blue-100 text-blue-800' :
                    o.status === 'Ready to Deliver' ? 'bg-yellow-100 text-yellow-800' :
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

    return `
    <section class="px-2 sm:px-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h2 class="text-xl sm:text-2xl font-bold text-gray-800">Admin Dashboard</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <button onclick="adminAddProduct()" class="px-3 py-2 bg-lime-600 text-white rounded text-sm sm:text-base hover:bg-lime-700">Add Product</button>
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

      <div class="space-y-6">
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg">Products — Regular</h3>
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
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${regularRows || '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="6">No regular products available</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

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
                  <th class="px-3 py-3 text-left font-medium">Remaining</th>
                  <th class="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${preorderRows || '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="7">No pre-order products available</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg">Orders — Regular</h3>
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
              <tbody class="divide-y divide-gray-200">
                ${regularOrderRows || '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="6">No regular orders</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b">
            <h3 class="font-semibold text-lg">Orders — Pre-Order</h3>
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
              <tbody class="divide-y divide-gray-200">
                ${preorderOrderRows || '<tr><td class="px-3 py-8 text-center text-gray-500 text-sm" colspan="6">No pre-order orders</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
    `;
};

window.toggleHowItWorks = function() {
    showModal('How Palengke.com Works', `
    <ol class="list-decimal pl-5 text-gray-700">
        <li>Browse fresh products from local farmers & fisherfolk.</li>
        <li>Add items to cart and proceed to checkout (COD).</li>
        <li>LGU Admin manages product listings and order statuses.</li>
    </ol>
`, `<button onclick="hideModal()" class="px-4 py-2 bg-gray-100 rounded">Close</button>`);
};

// Event Listeners
function setupEventListeners() {
    // Main navigation
    document.getElementById('view-store').addEventListener('click', () => switchTo('shop'));
    document.getElementById('view-orders').addEventListener('click', () => switchTo('orders'));
    document.getElementById('browse-products').addEventListener('click', () => switchTo('shop'));
    document.getElementById('how-it-works').addEventListener('click', toggleHowItWorks);
    
    // Mobile navigation
    document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileMenu);
    document.getElementById('mobile-view-store').addEventListener('click', () => switchTo('shop'));
    document.getElementById('mobile-view-orders').addEventListener('click', () => switchTo('orders'));
    
    // Cart
    document.getElementById('cart-btn').addEventListener('click', () => toggleCartDrawer());
    document.getElementById('close-cart').addEventListener('click', () => toggleCartDrawer(false));
    document.getElementById('checkout-btn').addEventListener('click', checkout);
    
    // Modal
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideModal();
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        
        if (mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            closeMobileMenu();
        }
    });
}

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
                window.APP_STATE.cart = Object.values(userCart);
            }
        }
    } else {
        window.APP_STATE.currentUser = null;
        window.APP_STATE.cart = [];
    }
    updateAuthArea();
    renderMain();
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
        document.getElementById('cart-drawer').classList.add('hidden');
        closeMobileMenu();
        hideUserMenu();
    }

});
