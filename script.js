// --- Polyfill for structuredClone ---
if (!window.structuredClone) {
    window.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // =========== STATE MANAGEMENT (DATABASE) & INITIALIZATION ========
    // =================================================================
    let db;
    let currentUser = null;
    let trendsChart = null;
    let salesCart = [];
    let sessionPopupsShown = false;
    const DB_KEY = 'angelaStoresDB_v5';

    const DEFAULT_DB = {
        users: [],
        products: [],
        sales: [],
        purchases: [],
        expenses: [],
        capital: {
            initial: 0,
            transactions: [],
        },
        statsStartDate: null,
    };

    function loadDatabase() {
        try {
            const data = localStorage.getItem(DB_KEY);
            db = data ? JSON.parse(data) : structuredClone(DEFAULT_DB);
        } catch (error) {
            console.error("Error parsing database from localStorage, resetting to default.", error);
            db = structuredClone(DEFAULT_DB);
        }
        
        for (const key in DEFAULT_DB) {
            if (!db.hasOwnProperty(key)) {
                 db[key] = structuredClone(DEFAULT_DB[key]);
            }
        }
        if (!db.capital || typeof db.capital !== 'object') {
            db.capital = structuredClone(DEFAULT_DB.capital);
        }
        if (!db.hasOwnProperty('statsStartDate')) {
            db.statsStartDate = null;
        }

        if (db.users.length === 0) {
            db.users.push({ id: generateId(), username: 'admin', password: 'password', role: 'admin' });
            db.users.push({ id: generateId(), username: 'manager', password: 'password', role: 'manager' });
            db.users.push({ id: generateId(), username: 'sales', password: 'password', role: 'salesRep' });
            saveDatabase();
        }
    }

    function saveDatabase() {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }


    // =================================================================
    // ======================= AUTHENTICATION ==========================
    // =================================================================
    
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('loginError');

        const user = db.users.find(u => u.username === username && u.password === password);

        if (user) {
            login(user);
            loginError.textContent = '';
        } else {
            loginError.textContent = 'Invalid username or password.';
        }
    });

    function login(user) {
        currentUser = user;
        sessionPopupsShown = false; 
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        document.getElementById('loginForm').reset();
        
        setupUIForRole();
        renderAll();

        if (['admin', 'manager'].includes(currentUser.role)) {
            showPerformancePopups();
        }
    }

    function logout() {
        currentUser = null;
        salesCart = [];
        const appContainer = document.getElementById('appContainer');
        appContainer.classList.remove('role-admin', 'role-manager', 'role-salesRep', 'role-auditor');
        document.getElementById('loginScreen').classList.remove('hidden');
        appContainer.classList.add('hidden');
        document.getElementById('mainMenu').classList.add('hidden');
    }

    // =================================================================
    // ====================== UI & NAVIGATION ==========================
    // =================================================================
    
    function setupUIForRole() {
        document.getElementById('currentUserDisplay').textContent = `User: ${currentUser.username} (${currentUser.role})`;
        
        // Add role class to the container for CSS-based visibility
        const appContainer = document.getElementById('appContainer');
        appContainer.classList.remove('role-admin', 'role-manager', 'role-salesRep', 'role-auditor');
        appContainer.classList.add(`role-${currentUser.role}`);
        
        const menuItems = {
            'Dashboard': { page: 'overviewPage', roles: ['admin', 'manager', 'auditor'] },
            'Point of Sale': { page: 'posPage', roles: ['admin', 'manager', 'salesRep'] },
            'Sales Log': { page: 'salesLogPage', roles: ['admin', 'manager', 'salesRep', 'auditor'] },
            'Product Management': { page: 'productManagementPage', roles: ['admin', 'manager'] },
            'Stock Monitoring': { page: 'stockLevelPage', roles: ['admin', 'manager', 'salesRep', 'auditor'] },
            'P&L Tracker': { page: 'plTrackerPage', roles: ['admin', 'manager', 'auditor'] },
            'Purchase History': { page: 'purchaseHistoryPage', roles: ['admin', 'manager', 'auditor'] },
            'Expenses': { page: 'expensesManagerPage', roles: ['admin', 'manager'] },
            'Capital Tracker': { page: 'capitalTrackerPage', roles: ['admin'] },
            'User Management': { page: 'userManagementPage', roles: ['admin'] },
            'Reports': { page: 'reportsPage', roles: ['admin', 'manager', 'auditor'] },
            'Settings': { page: 'userSettingsPage', roles: ['admin', 'manager', 'salesRep', 'auditor'] },
        };

        const menuContainer = document.getElementById('mainMenu');
        menuContainer.innerHTML = '';
        Object.entries(menuItems).forEach(([title, item]) => {
            if (item.roles.includes(currentUser.role)) {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = title;
                link.dataset.page = item.page;
                link.classList.add('menu-link');
                menuContainer.appendChild(link);
            }
        });
        
        const defaultPage = currentUser.role === 'salesRep' ? 'posPage' : 'overviewPage';
        showPage(defaultPage);
    }
    
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
        const pageToShow = document.getElementById(pageId);
        if (pageToShow) {
            pageToShow.classList.remove('hidden');
        }
        document.getElementById('mainMenu').classList.add('hidden');

        if (pageId === 'posPage') renderPosPage();
    }
    
    document.getElementById('mainMenu').addEventListener('click', (e) => {
        if (e.target.classList.contains('menu-link')) {
            e.preventDefault();
            showPage(e.target.dataset.page);
        }
    });
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('mainMenu').classList.toggle('hidden');
    });
    document.getElementById('logoutButton').addEventListener('click', logout);
    
    window.showModal = function(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
    window.closeModal = function(modalId) { document.getElementById(modalId).classList.add('hidden'); }
    
    // =================================================================
    // ===================== UI RENDERING FUNCTIONS ====================
    // =================================================================

    function formatNaira(amount) {
        return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    function renderAll() {
        renderOverview();
        renderProductManagement();
        renderSalesLog();
        renderStockLevels();
        renderPLTracker();
        renderPurchaseHistory();
        renderExpenses();
        if (currentUser.role === 'admin') {
            renderCapitalTracker();
            renderUserManagement();
        }
    }
    
    function renderOverview() {
        const startDate = db.statsStartDate;
        const statsBtn = document.getElementById('toggleStatsPeriodBtn');
        const startDateDisplay = document.getElementById('statsStartDateDisplay');
        const overviewTitle = document.getElementById('overviewTitle');
        const soldCountHeader = document.getElementById('totalSoldCountHeader');
        const salesValueHeader = document.getElementById('totalSalesValueHeader');
        const profitHeader = document.getElementById('cumulativeProfitHeader');

        let filteredSales = db.sales;
        let filteredExpenses = db.expenses;
        
        if (startDate) {
            filteredSales = db.sales.filter(s => new Date(s.dateTime) >= new Date(startDate));
            filteredExpenses = db.expenses.filter(e => new Date(e.date) >= new Date(startDate));
            statsBtn.textContent = 'Show All-Time Stats';
            startDateDisplay.textContent = ` ${new Date(startDate).toLocaleDateString()}`;
            overviewTitle.textContent = "Current Period Overview";
            soldCountHeader.textContent = "Units Sold (Period)";
            salesValueHeader.textContent = "Sales Value (Period)";
            profitHeader.textContent = "Net Profit (Period)";
        } else {
            statsBtn.textContent = 'Start New Period';
            startDateDisplay.textContent = 'the beginning';
            overviewTitle.textContent = "Dashboard Overview";
            soldCountHeader.textContent = "Total Units Sold";
            salesValueHeader.textContent = "Total Sales Value";
            profitHeader.textContent = "Cumulative Net Profit";
        }
        
        let totalStock = db.products.reduce((sum, p) => sum + p.quantityInStock, 0);
        let totalSoldUnits = filteredSales.reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + i.quantity, 0), 0);
        let totalSalesValue = filteredSales.reduce((sum, s) => sum + s.grandTotal, 0);
        
        document.getElementById('totalStockCount').textContent = totalStock.toLocaleString();
        document.getElementById('totalSoldCount').textContent = totalSoldUnits.toLocaleString();
        document.getElementById('totalSalesValue').textContent = formatNaira(totalSalesValue);

        if (!['salesRep', 'manager'].includes(currentUser.role)) {
            const totalCostOfGoodsSold = filteredSales.reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + (i.buyingPrice * i.quantity), 0), 0);
            const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
            let periodProfit = totalSalesValue - totalCostOfGoodsSold - totalExpenses;
            
            const profitDisplay = document.getElementById('cumulativeProfit');
            const profitCard = document.getElementById('cumulativeProfitCard');
            profitDisplay.textContent = formatNaira(periodProfit);
            profitCard.classList.toggle('loss', periodProfit < 0);
            profitCard.classList.toggle('profit', periodProfit >= 0);
        }

        renderTrendsChart();
    }

    function renderTrendsChart() {
        const ctx = document.getElementById('trendsChart').getContext('2d');
        const salesByMonth = {};
        const profitByMonth = {};
        
        db.sales.forEach(s => { 
            const month = s.date.substring(0, 7); 
            salesByMonth[month] = (salesByMonth[month] || 0) + s.grandTotal; 
            profitByMonth[month] = (profitByMonth[month] || 0) + s.totalProfit;
        });
        db.expenses.forEach(e => { 
            const month = e.date.substring(0, 7); 
            profitByMonth[month] = (profitByMonth[month] || 0) - e.amount;
        });

        const labels = [...new Set([...Object.keys(salesByMonth), ...Object.keys(profitByMonth)])].sort();
        const salesData = labels.map(label => salesByMonth[label] || 0);
        
        let datasets = [
            { type: 'bar', label: 'Monthly Sales', data: salesData, backgroundColor: 'rgba(10, 147, 150, 0.6)', yAxisID: 'y' }
        ];

        // Only add profit data for admin and auditor roles
        if (!['salesRep', 'manager'].includes(currentUser.role)) {
            const profitData = labels.map(label => profitByMonth[label] || 0);
            datasets.unshift({ type: 'line', label: 'Monthly Net Profit', data: profitData, borderColor: 'var(--green)', tension: 0.1, yAxisID: 'y1' });
        }
        
        const scales = { y: { beginAtZero: true, position: 'left' } };
        if (!['salesRep', 'manager'].includes(currentUser.role)) {
             scales.y1 = { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } };
        }

        if (trendsChart) trendsChart.destroy();
        trendsChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: { scales }
        });
    }

    window.renderSalesLog = function() {
        const table = document.getElementById('salesLogTable');
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Define headers based on role
        const showProfit = !['salesRep', 'manager'].includes(currentUser.role);
        let headers = ['Invoice #', 'Date & Time', 'Items', 'Total'];
        if (showProfit) headers.push('Profit');
        headers.push('Customer', 'Sold By', 'Status', 'Actions');

        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        
        const searchTerm = document.getElementById('salesLogSearchInput').value.toLowerCase();
        const dateFilter = document.getElementById('salesLogDateFilter').value;

        let filteredSales = db.sales.filter(s => 
            (!searchTerm || s.invoiceNumber.toLowerCase().includes(searchTerm) || (s.customerName && s.customerName.toLowerCase().includes(searchTerm))) &&
            (!dateFilter || s.date === dateFilter)
        );

        filteredSales.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)).forEach(s => {
            const seller = db.users.find(u => u.id === s.userId);
            const statusHtml = s.submitted 
                ? `<span style="color:var(--green); font-weight:bold;">✔ Submitted</span>` 
                : `<span style="color:var(--yellow); font-weight:bold;">Pending</span>`;
            
            let rowHtml = `
                <td>${s.invoiceNumber}</td>
                <td>${new Date(s.dateTime).toLocaleString()}</td>
                <td>${s.items.length}</td>
                <td>${formatNaira(s.grandTotal)}</td>
            `;
            if (showProfit) {
                rowHtml += `<td>${formatNaira(s.totalProfit)}</td>`;
            }
            rowHtml += `
                <td>${s.customerName}</td>
                <td>${seller ? seller.username : 'N/A'}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="action-button edit-btn" onclick="printMultiItemReceipt('${s.invoiceNumber}')">Receipt</button>
                    ${(currentUser.role === 'admin' || (currentUser.role === 'manager' && !s.submitted)) ? `<button class="action-button delete-btn" onclick="deleteSale('${s.invoiceNumber}')">Delete</button>` : ''}
                </td>
            `;
            tbody.innerHTML += `<tr>${rowHtml}</tr>`;
        });

        const pendingSalesForCurrentUser = db.sales.some(s => s.userId === currentUser.id && !s.submitted);
        document.getElementById('submitMySalesBtn').disabled = !pendingSalesForCurrentUser;
    }

    window.renderPLTracker = function() {
        const selectedMonth = document.getElementById('plMonthFilter').value || new Date().toISOString().slice(0, 7);
        if (!document.getElementById('plMonthFilter').value) {
            document.getElementById('plMonthFilter').value = selectedMonth;
        }
        
        const salesInPeriod = db.sales.filter(s => s.date.startsWith(selectedMonth));
        const expensesInPeriod = db.expenses.filter(e => e.date.startsWith(selectedMonth));

        let revenue = salesInPeriod.reduce((sum, s) => sum + s.grandTotal, 0);
        let costOfGoods = salesInPeriod.reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + (i.buyingPrice * i.quantity), 0), 0);
        let totalExpenses = expensesInPeriod.reduce((sum, e) => sum + e.amount, 0);
        
        document.getElementById('plTotalRevenue').textContent = formatNaira(revenue);
        document.getElementById('plTotalCost').textContent = formatNaira(costOfGoods);
        document.getElementById('plTotalExpenses').textContent = formatNaira(totalExpenses);
        
        if (!['salesRep', 'manager'].includes(currentUser.role)) {
            const netProfit = revenue - costOfGoods - totalExpenses;
            const netProfitDisplay = document.getElementById('plNetProfit');
            const netProfitCard = document.getElementById('plNetProfitCard');
            netProfitDisplay.textContent = formatNaira(netProfit);
            netProfitCard.classList.remove('profit', 'loss');
            netProfitCard.classList.add(netProfit >= 0 ? 'profit' : 'loss');
        }
    }

    window.renderPurchaseHistory = function() {
        const tbody = document.getElementById('purchaseHistoryTable').querySelector('tbody');
        tbody.innerHTML = '';
        const startDate = document.getElementById('purchaseStartDate').value;
        const endDate = document.getElementById('purchaseEndDate').value;

        let filteredPurchases = db.purchases.filter(p => {
            if (startDate && p.date < startDate) return false;
            if (endDate && p.date > endDate) return false;
            return true;
        });

        filteredPurchases.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(p => {
            const product = db.products.find(prod => prod.id === p.productId);
            tbody.innerHTML += `
                <tr>
                    <td>${p.date}</td>
                    <td>${product ? product.name : 'N/A (Deleted)'}</td>
                    <td>${p.quantity}</td>
                    <td>${formatNaira(p.costPerItem)}</td>
                    <td>${formatNaira(p.totalCost)}</td>
                    <td>${p.supplier}</td>
                    <td>${p.paymentMode}</td>
                </tr>
            `;
        });
    }
    
    function renderExpenses() {
        const tbody = document.getElementById('expensesTable').querySelector('tbody');
        tbody.innerHTML = '';
        db.expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(e => {
            tbody.innerHTML += `
                <tr>
                    <td>${e.date}</td>
                    <td>${e.category}</td>
                    <td>${e.description}</td>
                    <td>${formatNaira(e.amount)}</td>
                    <td>
                        <button class="action-button edit-btn" onclick="editExpense('${e.id}')">Edit</button>
                        <button class="action-button delete-btn" onclick="deleteExpense('${e.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    }
    
    function renderCapitalTracker() {
        const initialCapital = db.capital.initial;
        const totalInjections = db.capital.transactions
            .filter(t => t.type === 'injection')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalWithdrawals = db.capital.transactions
            .filter(t => t.type === 'withdrawal')
            .reduce((sum, t) => sum + t.amount, 0);
        const currentCapital = initialCapital + totalInjections - totalWithdrawals;

        document.getElementById('initialCapitalDisplay').textContent = formatNaira(initialCapital);
        document.getElementById('totalInjectionsDisplay').textContent = formatNaira(totalInjections);
        document.getElementById('totalWithdrawalsDisplay').textContent = formatNaira(totalWithdrawals);
        document.getElementById('currentCapitalDisplay').textContent = formatNaira(currentCapital);

        const tbody = document.getElementById('capitalHistoryTable').querySelector('tbody');
        tbody.innerHTML = '';
        db.capital.transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(t => {
            tbody.innerHTML += `
                <tr>
                    <td>${t.date}</td>
                    <td style="text-transform: capitalize;">${t.type}</td>
                    <td style="color:${t.type === 'withdrawal' ? 'var(--red)' : 'var(--green)'}; font-weight: bold;">${t.type === 'withdrawal' ? '-' : '+'}${formatNaira(t.amount)}</td>
                    <td>${t.notes || 'N/A'}</td>
                    <td><button class="action-button delete-btn" onclick="deleteCapitalTransaction('${t.id}')">Delete</button></td>
                </tr>
            `;
        });
    }

    // =================================================================
    // ====================== POINT OF SALE (CART) =====================
    // =================================================================
    
    function renderPosPage() {
        renderProductCatalog();
        renderCart();
    }

    function renderProductCatalog() {
        const catalog = document.getElementById('productCatalog');
        const searchTerm = document.getElementById('posProductSearch').value.toLowerCase();
        catalog.innerHTML = '';
        db.products
            .filter(p => p.name.toLowerCase().includes(searchTerm))
            .sort((a,b) => a.name.localeCompare(b.name))
            .forEach(p => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.productId = p.id;
                if (p.quantityInStock <= 0) card.classList.add('disabled');
                card.innerHTML = `
                    <div class="product-card-name">${p.name}</div>
                    <div class="product-card-price">${formatNaira(p.sellingPrice)}</div>
                    <div class="product-card-stock">Stock: ${p.quantityInStock}</div>
                `;
                catalog.appendChild(card);
            });
    }
    
    function renderCart() {
        const cartItemsList = document.getElementById('cartItems');
        cartItemsList.innerHTML = '';
        let total = 0;
        if (salesCart.length === 0) {
            cartItemsList.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Cart is empty</p>';
        } else {
            salesCart.forEach(item => {
                const li = document.createElement('li');
                li.className = 'cart-item';
                const itemTotal = item.sellingPrice * item.quantity;
                total += itemTotal;
                li.innerHTML = `
                    <span class="cart-item-name">${item.name}</span>
                    <div class="cart-item-qty">
                        <button onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})">+</button>
                    </div>
                    <span class="cart-item-total">${formatNaira(itemTotal)}</span>
                    <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">&times;</button>
                `;
                cartItemsList.appendChild(li);
            });
        }
        document.getElementById('cartTotalDisplay').textContent = formatNaira(total);
        document.getElementById('finalizeSaleBtn').disabled = salesCart.length === 0;
    }

    function addToCart(productId) {
        const product = db.products.find(p => p.id === productId);
        if (!product || product.quantityInStock <= 0) return;

        const cartItem = salesCart.find(item => item.id === productId);
        if (cartItem) {
            if (cartItem.quantity < product.quantityInStock) {
                cartItem.quantity++;
            } else {
                alert('Maximum stock for this item reached.');
            }
        } else {
            salesCart.push({
                id: product.id, name: product.name,
                sellingPrice: product.sellingPrice, buyingPrice: product.buyingPrice,
                quantity: 1
            });
        }
        renderCart();
    }

    window.updateCartQuantity = function(productId, newQuantity) {
        const cartItem = salesCart.find(item => item.id === productId);
        const product = db.products.find(p => p.id === productId);
        if (!cartItem || !product) return;
        
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else if (newQuantity > product.quantityInStock) {
            alert('Cannot add more than available in stock.');
            cartItem.quantity = product.quantityInStock;
        } else {
            cartItem.quantity = newQuantity;
        }
        renderCart();
    }

    window.removeFromCart = function(productId) {
        salesCart = salesCart.filter(item => item.id !== productId);
        renderCart();
    }

    function clearCart() {
        salesCart = [];
        renderCart();
    }

    function finalizeSale() {
        const customerName = document.getElementById('customerName').value || 'Walk-in Customer';
        const now = new Date();
        
        const saleRecord = {
            invoiceNumber: `INV-${Date.now()}`,
            date: now.toISOString().split('T')[0],
            dateTime: now.toISOString(),
            userId: currentUser.id,
            customerName: customerName,
            submitted: false, 
            items: structuredClone(salesCart.map(item => ({
                productId: item.id, productName: item.name,
                quantity: item.quantity, sellingPrice: item.sellingPrice,
                buyingPrice: item.buyingPrice,
            }))),
            grandTotal: salesCart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0),
            totalProfit: salesCart.reduce((sum, item) => sum + ((item.sellingPrice - item.buyingPrice) * item.quantity), 0),
        };

        saleRecord.items.forEach(item => {
            const product = db.products.find(p => p.id === item.productId);
            if (product) {
                product.quantityInStock -= item.quantity;
                product.quantitySold = (product.quantitySold || 0) + item.quantity;
            }
        });

        db.sales.push(saleRecord);
        saveDatabase();
        
        clearCart();
        closeModal('checkoutModal');
        renderAll();
        showPage('posPage');
        printMultiItemReceipt(saleRecord.invoiceNumber);
    }

    document.getElementById('productCatalog').addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card && !card.classList.contains('disabled')) {
            addToCart(card.dataset.productId);
        }
    });
    document.getElementById('posProductSearch').addEventListener('input', renderProductCatalog);
    document.getElementById('clearCartBtn').addEventListener('click', clearCart);
    document.getElementById('finalizeSaleBtn').addEventListener('click', () => {
        document.getElementById('checkoutForm').reset();
        showModal('checkoutModal');
    });
    document.getElementById('checkoutForm').addEventListener('submit', (e) => {
        e.preventDefault();
        finalizeSale();
    });

    // =================================================================
    // =========== RECEIPT, PRINTING, DELETION, & SUBMISSION ===========
    // =================================================================

    window.submitMySales = function() {
        const salesToSubmit = db.sales.filter(s => s.userId === currentUser.id && !s.submitted);
        if (salesToSubmit.length === 0) {
            alert('You have no pending sales to submit.');
            return;
        }

        const totalProfitToSubmit = salesToSubmit.reduce((sum, s) => sum + s.totalProfit, 0);
        let confirmationMessage = '';
        
        // Admins and auditors see the financial impact.
        if (['admin', 'auditor'].includes(currentUser.role)) {
            confirmationMessage = `You are about to submit a total profit of ${formatNaira(totalProfitToSubmit)} from ${salesToSubmit.length} sale(s). This will be added to the company capital. This action cannot be undone.\n\nDo you want to proceed?`;
        } else {
            // Sales Reps and Managers only see the number of sales, not the value.
            confirmationMessage = `You are about to submit ${salesToSubmit.length} pending sale(s). This action cannot be undone.\n\nDo you want to proceed?`;
        }
        
        if (confirm(confirmationMessage)) {
            // The profit is calculated and added regardless of the message shown.
            db.capital.transactions.push({
                id: generateId(),
                date: new Date().toISOString().split('T')[0],
                type: 'injection',
                amount: totalProfitToSubmit,
                notes: `Profit deposit from sales by ${currentUser.username}`
            });

            salesToSubmit.forEach(sale => {
                const saleInDb = db.sales.find(s => s.invoiceNumber === sale.invoiceNumber);
                if (saleInDb) {
                    saleInDb.submitted = true;
                }
            });

            saveDatabase();
            alert('Sales submitted successfully!');
            renderAll();
        }
    }

    window.printMultiItemReceipt = function(invoiceNumber) {
        const sale = db.sales.find(s => s.invoiceNumber === invoiceNumber);
        if (!sale) return;
        const seller = db.users.find(u => u.id === sale.userId);

        const receiptContent = document.getElementById('receiptModalContent');
        
        let itemsHtml = '';
        sale.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.productName}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">${formatNaira(item.sellingPrice)}</td>
                    <td class="text-right">${formatNaira(item.sellingPrice * item.quantity)}</td>
                </tr>
            `;
        });
        
        receiptContent.innerHTML = `
            <div class="receipt-header"><h2>Buisness Manager</h2></div>
            <div class="receipt-info">
                <div><strong>To:</strong><br><span>${sale.customerName}</span></div>
                <div><strong>Invoice #:</strong> <span>${sale.invoiceNumber}</span><br>
                     <strong>Date:</strong> <span>${new Date(sale.dateTime).toLocaleString()}</span><br>
                     <strong>Sold By:</strong> <span>${seller ? seller.username : 'N/A'}</span>
                </div>
            </div>
            <table id="receiptItemsTable">
                <thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <div class="receipt-total-section"><p>TOTAL: ${formatNaira(sale.grandTotal)}</p></div>
            <div class="receipt-footer"><p>Thank you for your patronage!</p></div>
        `;
        showModal('receiptModal');
    }
    
    window.printReceipt = function() {
        window.print();
    }

    window.deleteSale = function(invoiceNumber) {
        const saleIndex = db.sales.findIndex(s => s.invoiceNumber === invoiceNumber);
        if (saleIndex === -1) {
            console.error("Sale not found for deletion:", invoiceNumber);
            return;
        }

        const sale = db.sales[saleIndex];
        let confirmationMessage = '';
        let isSubmittedReversal = false;

        if (sale.submitted && currentUser.role === 'admin') {
            // Admin deleting a submitted sale (refund/reversal case)
            confirmationMessage = `ADMIN ACTION:\nThis sale has been submitted and its profit (${formatNaira(sale.totalProfit)}) was added to capital.\n\nDeleting this will REVERSE the transaction by creating a capital withdrawal and returning stock.\n\nThis is for handling refunds or corrections. Are you sure you want to proceed?`;
            isSubmittedReversal = true;
        } else if (sale.submitted) {
            // Non-admin trying to delete a submitted sale
            alert('This sale has already been submitted and cannot be deleted. Please contact an administrator for assistance with returns or refunds.');
            return;
        } else {
            // Deleting a pending sale
            confirmationMessage = 'Are you sure you want to delete this pending sale? The stock will be returned to inventory. This action cannot be undone.';
        }

        if (confirm(confirmationMessage)) {
            // Action confirmed, proceed with deletion logic

            // 1. Return stock to inventory (common for both cases)
            sale.items.forEach(item => {
                const product = db.products.find(p => p.id === item.productId);
                if (product) {
                    product.quantityInStock += item.quantity;
                    product.quantitySold -= item.quantity;
                }
            });

            // 2. Handle capital reversal if it was a submitted sale
            if (isSubmittedReversal) {
                db.capital.transactions.push({
                    id: generateId(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'withdrawal',
                    amount: sale.totalProfit,
                    notes: `Reversal/Refund for submitted Invoice #${sale.invoiceNumber}`
                });
            }

            // 3. Remove the sale record
            db.sales.splice(saleIndex, 1);

            // 4. Save and re-render
            saveDatabase();
            alert('Sale has been successfully deleted.');
            renderAll();
        }
    }
    
    // =================================================================
    // ================ PERFORMANCE POPUPS & OTHER MGMT ================
    // =================================================================
    
    function toggleStatsPeriod() {
        if (db.statsStartDate) {
            db.statsStartDate = null;
            saveDatabase();
            renderOverview();
            alert("Dashboard now showing all-time statistics.");
        } else {
            const confirmation = confirm("Are you sure you want to start a new reporting period?\n\nThis will reset the main dashboard stats, tracking new totals from this moment forward.\n\nAll historical data remains safe and accessible in reports.");
            if (confirmation) {
                db.statsStartDate = new Date().toISOString();
                saveDatabase();
                renderOverview();
                alert("Dashboard stats have been reset for the new period.");
            }
        }
    }

    function showPerformancePopups() {
        if (sessionPopupsShown) return;

        const soldProducts = db.products.filter(p => p.quantitySold > 0);
        const unsoldProducts = db.products.filter(p => (p.quantitySold || 0) === 0 && p.quantityInStock > 0);

        if (soldProducts.length === 0 && unsoldProducts.length === 0) return;

        soldProducts.sort((a, b) => b.quantitySold - a.quantitySold);
        
        let bestSellersHtml = '<h3>⭐ Top Selling Products</h3>';
        if (soldProducts.length > 0) {
            bestSellersHtml += '<ul>';
            soldProducts.slice(0, 3).forEach(p => {
                bestSellersHtml += `<li><span>${p.name}</span> - ${p.quantitySold} units sold</li>`;
            });
            bestSellersHtml += '</ul>';
        } else {
            bestSellersHtml += '<p>No products have been sold yet.</p>';
        }

        let lowPerformersHtml = '<h3>⚠️ Products to Review (Low Sales)</h3>';
        if (unsoldProducts.length > 0) {
            lowPerformersHtml += '<ul>';
            unsoldProducts.slice(0, 5).forEach(p => {
                lowPerformersHtml += `<li><span>${p.name}</span> - 0 units sold</li>`;
            });
            lowPerformersHtml += '</ul>';
        } else {
            lowPerformersHtml += '<p>All products have at least one sale. Great job!</p>';
        }

        document.getElementById('performanceReportContent').innerHTML = bestSellersHtml + lowPerformersHtml;
        showModal('performanceReportModal');
        sessionPopupsShown = true;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
    
    function renderProductManagement() {
        const tbody = document.getElementById('productTable').querySelector('tbody');
        tbody.innerHTML = '';
        const searchTerm = document.getElementById('productSearchInput').value.toLowerCase();
        db.products.filter(p => p.name.toLowerCase().includes(searchTerm)).forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${p.name}</td><td>${p.category}</td><td>${formatNaira(p.buyingPrice)}</td>
                    <td>${formatNaira(p.sellingPrice)}</td><td>${p.quantityInStock}</td><td>${p.quantitySold || 0}</td>
                    <td>${p.supplier || 'N/A'}</td>
                    <td>
                        <button class="action-button edit-btn" onclick="editProduct('${p.id}')">Edit</button>
                        <button class="action-button delete-btn" onclick="deleteProduct('${p.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    }
    document.getElementById('productSearchInput').addEventListener('input', renderProductManagement);
    document.getElementById('addProductBtn').addEventListener('click', () => {
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('productModalTitle').textContent = 'Add New Product';
        document.getElementById('purchaseDetailsGroup').style.display = 'block';
        document.getElementById('purchaseDate').valueAsDate = new Date();
        showModal('productModal');
    });

    window.editProduct = function(id) {
        const p = db.products.find(p => p.id === id);
        if (!p) return;
        document.getElementById('productId').value = p.id;
        document.getElementById('productName').value = p.name;
        document.getElementById('productCategory').value = p.category;
        document.getElementById('buyingPrice').value = p.buyingPrice;
        document.getElementById('sellingPrice').value = p.sellingPrice;
        document.getElementById('quantityInStock').value = p.quantityInStock;
        document.getElementById('lowStockThreshold').value = p.lowStockThreshold || 10;
        document.getElementById('supplierInfo').value = p.supplier;
        document.getElementById('productModalTitle').textContent = 'Edit Product';
        document.getElementById('purchaseDetailsGroup').style.display = 'none';
        showModal('productModal');
    }
    
    document.getElementById('productForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('productId').value;
        const productData = {
            name: document.getElementById('productName').value, category: document.getElementById('productCategory').value,
            buyingPrice: parseFloat(document.getElementById('buyingPrice').value), sellingPrice: parseFloat(document.getElementById('sellingPrice').value),
            quantityInStock: parseInt(document.getElementById('quantityInStock').value), supplier: document.getElementById('supplierInfo').value,
            lowStockThreshold: parseInt(document.getElementById('lowStockThreshold').value),
        };
        if (id) {
            const index = db.products.findIndex(p => p.id === id);
            if (index !== -1) {
                db.products[index] = {...db.products[index], ...productData};
            }
        } else {
            productData.id = generateId(); productData.quantitySold = 0;
            db.products.push(productData);
            db.purchases.push({
                id: generateId(), productId: productData.id, date: document.getElementById('purchaseDate').value,
                quantity: productData.quantityInStock, costPerItem: productData.buyingPrice,
                totalCost: productData.buyingPrice * productData.quantityInStock, supplier: productData.supplier,
                paymentMode: document.getElementById('purchasePaymentMode').value,
            });
        }
        saveDatabase(); renderAll(); closeModal('productModal');
    });

    window.deleteProduct = function(id) {
        if (confirm('Are you sure you want to delete this product? All associated purchase and sales records will remain, but the link will be broken.')) {
            db.products = db.products.filter(p => p.id !== id);
            saveDatabase(); renderAll();
        }
    }

    function renderStockLevels() {
        const tbody = document.getElementById('stockLevelTable').querySelector('tbody');
        tbody.innerHTML = '';
        db.products.forEach(p => {
            const threshold = p.lowStockThreshold || 10;
            let statusText, statusColor;
            if (p.quantityInStock <= 0) {
                statusText = 'Out of Stock'; statusColor = 'var(--red)';
            } else if (p.quantityInStock <= threshold) {
                statusText = 'Low Stock'; statusColor = 'var(--yellow)';
            } else {
                statusText = 'In Stock'; statusColor = 'var(--green)';
            }

            const totalStockEver = p.quantityInStock + (p.quantitySold || 0);
            const stockPercent = totalStockEver > 0 ? (p.quantityInStock / totalStockEver) * 100 : 0;
            const stockLevelBar = `<div style="width: 100%; background: #eee; border-radius: 5px; overflow:hidden;"><div style="width: ${stockPercent}%; height: 10px; background: ${statusColor};"></div></div>`;

            tbody.innerHTML += `
                <tr>
                    <td><span style="color:${statusColor}; font-weight: bold;">${statusText}</span></td>
                    <td>${p.name}</td><td>${p.quantityInStock}</td>
                    <td>${threshold}</td><td>${stockLevelBar}</td>
                </tr>`;
        });
    }

    document.getElementById('addExpenseBtn').addEventListener('click', () => {
        document.getElementById('expenseForm').reset();
        document.getElementById('expenseId').value = '';
        document.getElementById('expenseModalTitle').textContent = 'Add New Expense';
        document.getElementById('expenseDate').valueAsDate = new Date();
        showModal('expenseModal');
    });
    
    window.editExpense = function(id) {
        const expense = db.expenses.find(e => e.id === id);
        if (!expense) return;
        document.getElementById('expenseId').value = expense.id;
        document.getElementById('expenseDate').value = expense.date;
        document.getElementById('expenseCategory').value = expense.category;
        document.getElementById('expenseDescription').value = expense.description;
        document.getElementById('expenseAmount').value = expense.amount;
        document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
        showModal('expenseModal');
    }

    document.getElementById('expenseForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('expenseId').value;
        const expenseData = {
            date: document.getElementById('expenseDate').value,
            category: document.getElementById('expenseCategory').value,
            description: document.getElementById('expenseDescription').value,
            amount: parseFloat(document.getElementById('expenseAmount').value),
        };
        if (id) {
            const index = db.expenses.findIndex(exp => exp.id === id);
            db.expenses[index] = { ...db.expenses[index], ...expenseData };
        } else {
            expenseData.id = generateId();
            db.expenses.push(expenseData);
        }
        saveDatabase(); renderAll(); closeModal('expenseModal');
    });

    window.deleteExpense = function(id) {
        if (confirm('Are you sure you want to delete this expense record?')) {
            db.expenses = db.expenses.filter(e => e.id !== id);
            saveDatabase(); renderAll();
        }
    }
    window.toggleSalaryVisibility = function(element) { const input = element.previousElementSibling; input.type = input.type === 'password' ? 'text' : 'password'; element.textContent = input.type === 'password' ? '👁️' : '🙈'; }

    document.getElementById('addCapitalTransactionBtn').addEventListener('click', () => {
        document.getElementById('capitalForm').reset();
        document.getElementById('capitalTransactionId').value = '';
        document.getElementById('capitalDate').valueAsDate = new Date();
        document.getElementById('capitalModalTitle').textContent = 'Add Capital Transaction';
        showModal('capitalModal');
    });

    document.getElementById('capitalForm').addEventListener('submit', e => {
        e.preventDefault();
        const type = document.getElementById('capitalType').value;
        const amount = parseFloat(document.getElementById('capitalAmount').value);

        if (type === 'initial') {
            db.capital.initial = amount;
        } else {
            db.capital.transactions.push({
                id: generateId(), date: document.getElementById('capitalDate').value,
                type: type, amount: amount,
                notes: document.getElementById('capitalNotes').value,
            });
        }
        saveDatabase(); renderCapitalTracker(); closeModal('capitalModal');
    });

    window.deleteCapitalTransaction = function(id) {
        if(confirm('Are you sure you want to delete this capital transaction?')) {
            db.capital.transactions = db.capital.transactions.filter(t => t.id !== id);
            saveDatabase(); renderCapitalTracker();
        }
    }
    
    function renderUserManagement() {
        const tbody = document.getElementById('userTable').querySelector('tbody');
        tbody.innerHTML = '';
        db.users.forEach(user => {
            tbody.innerHTML += `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.role}</td>
                    <td>
                        <button class="action-button edit-btn" onclick="editUser('${user.id}')">Edit</button>
                        ${user.id !== currentUser.id ? `<button class="action-button delete-btn" onclick="deleteUser('${user.id}')">Delete</button>` : ''}
                    </td>
                </tr>
            `;
        });
    }

    document.getElementById('addUserBtn').addEventListener('click', () => {
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalTitle').textContent = 'Add New User';
        document.getElementById('userPassword').required = true;
        document.getElementById('userPassword').placeholder = "At least 4 characters";
        showModal('userModal');
    });

    window.editUser = function(id) {
        const user = db.users.find(u => u.id === id);
        if (!user) return;
        document.getElementById('userId').value = user.id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userRole').value = user.role;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').placeholder = "Enter new password (optional)";
        document.getElementById('userPassword').required = false;
        document.getElementById('userModalTitle').textContent = 'Edit User';
        showModal('userModal');
    }

    document.getElementById('userForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('userId').value;
        const username = document.getElementById('userUsername').value;
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;

        if (id) {
            const user = db.users.find(u => u.id === id);
            user.username = username; user.role = role;
            if (password) user.password = password;
        } else {
            if (db.users.some(u => u.username === username)) {
                alert('Username already exists.'); return;
            }
            db.users.push({ id: generateId(), username, password, role });
        }
        saveDatabase(); renderUserManagement(); closeModal('userModal');
    });

    window.deleteUser = function(id) {
        if(confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            db.users = db.users.filter(u => u.id !== id);
            saveDatabase(); renderUserManagement();
        }
    }

    document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;
        const statusEl = document.getElementById('passwordChangeStatus');

        if (currentUser.password !== currentPassword) {
            statusEl.textContent = 'Current password is incorrect.'; statusEl.style.color = 'red'; return;
        }
        if (newPassword !== confirmNewPassword) {
            statusEl.textContent = 'New passwords do not match.'; statusEl.style.color = 'red'; return;
        }

        currentUser.password = newPassword;
        const userInDb = db.users.find(u => u.id === currentUser.id);
        if(userInDb) userInDb.password = newPassword;
        
        saveDatabase();
        statusEl.textContent = 'Password changed successfully!'; statusEl.style.color = 'green';
        e.target.reset();
        setTimeout(() => statusEl.textContent = '', 3000);
    });
    
    // --- PDF/CSV Download ---
    const pdfStyles = {
        headStyles: { fillColor: [0, 95, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [244, 244, 249] },
        styles: { cellPadding: 3, fontSize: 9, cellWidth: 'wrap' },
        columnStyles: { 0: { cellWidth: 'auto' }, 2: { cellWidth: 'auto' } }
    };

    document.getElementById('downloadPurchasePdfBtn').addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.setTextColor(0, 95, 115);
        doc.text("Purchase History Report", 14, 16);
        const tableData = db.purchases.map(p => {
            const product = db.products.find(prod => prod.id === p.productId);
            return [ p.date, product ? product.name : 'N/A (Deleted)', p.quantity, formatNaira(p.costPerItem), formatNaira(p.totalCost), p.supplier, p.paymentMode ];
        });
        doc.autoTable({ head: [['Date', 'Product', 'Qty', 'Cost/Item', 'Total Cost', 'Supplier', 'Payment']], body: tableData, startY: 25, ...pdfStyles });
        doc.save('AngelaStores_PurchaseHistory.pdf');
    });

    document.getElementById('downloadPurchaseCsvBtn').addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Product,Quantity,Cost per Item,Total Cost,Supplier,Payment Mode\r\n";
        db.purchases.forEach(p => {
            const product = db.products.find(prod => prod.id === p.productId);
            const row = [ p.date, `"${(product ? product.name : 'N/A (Deleted)').replace(/"/g, '""')}"`, p.quantity, p.costPerItem, p.totalCost, `"${(p.supplier || '').replace(/"/g, '""')}"`, p.paymentMode ].join(",");
            csvContent += row + "\r\n";
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "AngelaStores_PurchaseHistory.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    document.getElementById('generateReportBtn').addEventListener('click', () => {
        const selectedMonth = document.getElementById('reportMonthSelector').value;
        if (!selectedMonth) { alert('Please select a month to generate a report.'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        const monthDate = new Date(`${selectedMonth}-02`);
        const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const salesInPeriod = db.sales.filter(s => s.date.startsWith(selectedMonth));
        const purchasesInPeriod = db.purchases.filter(p => p.date.startsWith(selectedMonth));
        const expensesInPeriod = db.expenses.filter(e => e.date.startsWith(selectedMonth));

        doc.setFontSize(22); doc.setTextColor(0, 95, 115); doc.text(`Monthly Report for ${monthName}`, 14, 20);
        
        // --- Conditional Summary for PDF based on role ---
        const showProfit = !['salesRep', 'manager'].includes(currentUser.role);
        const revenue = salesInPeriod.reduce((sum, s) => sum + s.grandTotal, 0);
        const cogs = salesInPeriod.reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + (i.buyingPrice * i.quantity), 0), 0);
        const expenses = expensesInPeriod.reduce((sum, e) => sum + e.amount, 0);
        let summaryBody = [
            ['Total Revenue (Sales)', formatNaira(revenue)],
            ['Cost of Goods Sold (COGS)', formatNaira(cogs)],
            ['Operating Expenses', formatNaira(expenses)],
        ];
        if (showProfit) {
            const netProfit = revenue - cogs - expenses;
            summaryBody.splice(2, 0, ['Gross Profit (Revenue - COGS)', formatNaira(revenue - cogs)]);
            summaryBody.push([{ content: 'Net Profit / Loss', styles: { fontStyle: 'bold' } }, { content: formatNaira(netProfit), styles: { fontStyle: 'bold', textColor: netProfit >= 0 ? [45, 154, 71] : [208, 0, 0] } }]);
        }
        doc.autoTable({ startY: 30, theme: 'plain', body: summaryBody, styles: { fontSize: 12, cellPadding: 4 }, columnStyles: { 0: { fontStyle: 'bold' } } });
        
        if (salesInPeriod.length > 0) {
            doc.addPage(); doc.setFontSize(18); doc.setTextColor(0, 95, 115); doc.text(`Sales Details - ${monthName}`, 14, 20);
            
            let salesHead = [['Invoice #', 'Date & Time', 'Customer', 'Items', 'Total']];
            if(showProfit) salesHead[0].push('Profit');

            const salesData = salesInPeriod.map(s => {
                let row = [s.invoiceNumber, new Date(s.dateTime).toLocaleString(), s.customerName, s.items.length, formatNaira(s.grandTotal)];
                if(showProfit) row.push(formatNaira(s.totalProfit));
                return row;
            });
            doc.autoTable({ head: salesHead, body: salesData, startY: 25, ...pdfStyles });
        }

        if (purchasesInPeriod.length > 0) {
            doc.addPage(); doc.setFontSize(18); doc.setTextColor(0, 95, 115); doc.text(`Purchase Details - ${monthName}`, 14, 20);
            const purchaseData = purchasesInPeriod.map(p => {
                const product = db.products.find(prod => prod.id === p.productId);
                return [p.date, product ? product.name : 'N/A', p.quantity, formatNaira(p.costPerItem), formatNaira(p.totalCost), p.supplier];
            });
            doc.autoTable({ head: [['Date', 'Product', 'Qty', 'Cost/Item', 'Total Cost', 'Supplier']], body: purchaseData, startY: 25, ...pdfStyles });
        }
        if (expensesInPeriod.length > 0) {
            doc.addPage(); doc.setFontSize(18); doc.setTextColor(0, 95, 115); doc.text(`Expense Details - ${monthName}`, 14, 20);
            const expenseData = expensesInPeriod.map(e => [e.date, e.category, e.description, formatNaira(e.amount)]);
            doc.autoTable({ head: [['Date', 'Category', 'Description', 'Amount']], body: expenseData, startY: 25, ...pdfStyles });
        }
        doc.save(`AngelaStores_Report_${selectedMonth}.pdf`);
    });

    // =================================================================
    // ===================== APPLICATION STARTUP =======================
    // =================================================================
    document.getElementById('toggleStatsPeriodBtn').addEventListener('click', toggleStatsPeriod);
    loadDatabase();
    

});
