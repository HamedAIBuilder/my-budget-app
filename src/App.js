import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { db } from './firebase/config';
import { doc, deleteDoc } from 'firebase/firestore';
import { signUp, signIn, signOut, onAuthStateChangedListener, resetPassword, sendVerificationEmail, setupRecaptcha, signInWithPhone, confirmPhoneCode } from './firebase/auth';
import { createSavingsGoal, getSavingsGoals, calculateGoalProgress, getDaysUntilDeadline, isGoalOverdue } from './firebase/savingsGoals';
import { getExpenses, addExpense, calculateMonthlyExpenses } from './firebase/expenses';
import { createIncomeStream, getIncomeStreams, calculateMonthlyIncome } from './firebase/incomeStreams';
import { getMonthlySummaries, generateFinancialInsights } from './firebase/analytics';

function App() {
  const [incomeStreams, setIncomeStreams] = useState([]);
  const [goals, setGoals] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authForm, setAuthForm] = useState({ 
    email: '', 
    password: '', 
    confirmPassword: '',
    fullName: '',
    phone: '',
    verificationMethod: 'email' // 'email' or 'phone'
  });
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authError, setAuthError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showAccountConnection, setShowAccountConnection] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  // Additional state for WealthWise features
  const [monthlyData, setMonthlyData] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
    savingsTotal: 0
  });
  const [financialInsights, setFinancialInsights] = useState([]);
  const [monthlySummaries, setMonthlySummaries] = useState([]);

  // UI state
  const [showMotivation, setShowMotivation] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Form state
  const [incomeForm, setIncomeForm] = useState({ userId: '', name: '', amount: '', frequency: 'monthly', isRecurring: true });
  const [goalForm, setGoalForm] = useState({ 
    userId: '', 
    name: '', 
    targetAmount: '', 
    currentAmount: '', 
    deadline: '', 
    priority: 'medium',
    category: 'general'
  });
  const [expenseForm, setExpenseForm] = useState({ 
    userId: '', 
    name: '', 
    amount: '', 
    category: 'general', 
    date: new Date().toISOString().split('T')[0],
    description: '',
    frequency: 'one-time',
    isRecurring: false
  });

  // Update monthly data calculations
  const updateMonthlyData = useCallback((incomes, userExpenses, savingsGoals) => {
    const monthlyIncome = calculateMonthlyIncome(incomes);
    const monthlyExpensesTotal = calculateMonthlyExpenses(userExpenses);
    const totalSavings = savingsGoals.reduce((sum, goal) => sum + (goal.currentAmount || 0), 0);
    const balance = monthlyIncome - monthlyExpensesTotal;
    
    setMonthlyData({
      income: monthlyIncome,
      expenses: monthlyExpensesTotal,
      balance: balance,
      savingsTotal: totalSavings
    });
    
    // Generate insights
    const insights = generateFinancialInsights(incomes, userExpenses, savingsGoals, monthlySummaries);
    setFinancialInsights(insights);
  }, [monthlySummaries]);

  // Enhanced data fetching with real-time updates
  const fetchAll = useCallback(async () => {
    if (!authUser) return;
    
    // Use real-time listeners for authenticated user data
    const incomeUnsubscribe = getIncomeStreams(authUser.uid, (incomes) => {
      setIncomeStreams(incomes);
      updateMonthlyData(incomes, expenses, goals);
    });
    
    const goalsUnsubscribe = getSavingsGoals(authUser.uid, (savingsGoals) => {
      setGoals(savingsGoals);
      updateMonthlyData(incomeStreams, expenses, savingsGoals);
    });
    
    const expensesUnsubscribe = getExpenses(authUser.uid, (userExpenses) => {
      setExpenses(userExpenses);
      updateMonthlyData(incomeStreams, userExpenses, goals);
    });
    
    // Load monthly summaries for trends
    const summaries = await getMonthlySummaries(authUser.uid, 12);
    setMonthlySummaries(summaries);
    
    return () => {
      if (incomeUnsubscribe) incomeUnsubscribe();
      if (goalsUnsubscribe) goalsUnsubscribe();
      if (expensesUnsubscribe) expensesUnsubscribe();
    };
  }, [authUser, updateMonthlyData, expenses, goals, incomeStreams]);

  useEffect(() => { 
    if (authUser) {
      fetchAll(); 
    }
  }, [authUser, fetchAll]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener(user => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Auth handlers
  const handleAuth = async e => {
    e.preventDefault();
    setAuthError('');
    setResetSent(false);
    
    if (authMode === 'signup') {
      // Validate signup form
      if (authForm.password !== authForm.confirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }
      if (authForm.verificationMethod === 'phone' && !authForm.phone.trim()) {
        setAuthError('Phone number is required for phone verification.');
        return;
      }

      if (authForm.verificationMethod === 'email') {
        const res = await signUp(authForm.email, authForm.password);
        if (res.error) setAuthError(res.error);
        else {
          await sendVerificationEmail(res.user);
          setVerificationSent(true);
        }
      } else if (authForm.verificationMethod === 'phone') {
        if (!confirmationResult) {
          // Send code to phone
          const recaptcha = setupRecaptcha();
          const res = await signInWithPhone(authForm.phone, recaptcha);
          if (res.error) setAuthError(res.error);
          else {
            setConfirmationResult(res.confirmationResult);
            setVerificationSent(true);
          }
        } else {
          // Confirm phone code and create account
          const phoneRes = await confirmPhoneCode(confirmationResult, authForm.code);
          if (phoneRes.error) {
            setAuthError(phoneRes.error);
          } else {
            // Phone verified, now create email account
            const emailRes = await signUp(authForm.email, authForm.password);
            if (emailRes.error) setAuthError(emailRes.error);
            else {
              setShowAccountConnection(true);
            }
          }
        }
      }
    } else {
      // Login flow
      const res = await signIn(authForm.email, authForm.password);
      if (res.error) setAuthError(res.error);
      else if (!res.user.emailVerified) {
        setAuthError('Please verify your email before signing in.');
      }
    }
  };

  const handleForgotPassword = async e => {
    e.preventDefault();
    setAuthError('');
    setResetSent(false);
    
    const res = await resetPassword(authForm.email);
    if (res.error) setAuthError(res.error);
    else setResetSent(true);
  };
  // Account Connection Component
  const AccountConnectionPage = () => {
    const [selectedAccountType, setSelectedAccountType] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [accountForm, setAccountForm] = useState({
      bankName: '',
      accountNumber: '',
      routingNumber: '',
      accountType: 'checking'
    });
    const [cardForm, setCardForm] = useState({
      number: '',
      expMonth: '',
      expYear: '',
      cvc: '',
      name: ''
    });

    const handleAccountConnection = async (type) => {
      setLoading(true);
      setConnectionStatus('Connecting...');
      
      try {
        // Import our mock Stripe API
        const { mockStripeAPI } = await import('./stripe/config');
        
        let result;
        if (type === 'bank') {
          result = await mockStripeAPI.linkBankAccount('mock_account_id', accountForm);
          setConnectionStatus(`Bank account ending in ${result.last4} connected successfully!`);
        } else if (type === 'credit' || type === 'debit') {
          result = await mockStripeAPI.linkCard('mock_account_id', cardForm);
          setConnectionStatus(`${result.brand} card ending in ${result.last4} connected successfully!`);
        }
        
        setLoading(false);
        
        // Auto redirect to dashboard after successful connection
        setTimeout(() => {
          setShowAccountConnection(false);
        }, 2000);
      } catch (error) {
        setConnectionStatus('Connection failed. Please try again.');
        setLoading(false);
      }
    };

    return (
      <div className="App app-bg">
        <div className="account-connection-container">
          <div className="connection-header">
            <h1>Connect Your Financial Accounts</h1>
            <p>Securely connect your bank accounts and cards to get started with budget tracking</p>
          </div>
          
          {connectionStatus && (
            <div className={`connection-status ${loading ? 'loading' : 'success'}`}>
              {loading && <div className="spinner"></div>}
              <p>{connectionStatus}</p>
            </div>
          )}
          
          <div className="connection-options">
            <div className="connection-card">
              <div className="connection-icon">🏦</div>
              <h3>Bank Account</h3>
              <p>Connect your checking or savings account</p>
              
              {selectedAccountType === 'bank' ? (
                <div className="account-form">
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={accountForm.bankName}
                    onChange={(e) => setAccountForm({...accountForm, bankName: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={accountForm.accountNumber}
                    onChange={(e) => setAccountForm({...accountForm, accountNumber: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="Routing Number"
                    value={accountForm.routingNumber}
                    onChange={(e) => setAccountForm({...accountForm, routingNumber: e.target.value})}
                  />
                  <select
                    value={accountForm.accountType}
                    onChange={(e) => setAccountForm({...accountForm, accountType: e.target.value})}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                  <div className="form-buttons">
                    <button 
                      className="connect-btn primary"
                      onClick={() => handleAccountConnection('bank')}
                      disabled={loading || !accountForm.bankName || !accountForm.accountNumber || !accountForm.routingNumber}
                    >
                      {loading ? 'Connecting...' : 'Connect Bank Account'}
                    </button>
                    <button 
                      className="connect-btn cancel"
                      onClick={() => setSelectedAccountType('')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  className="connect-btn primary"
                  onClick={() => setSelectedAccountType('bank')}
                >
                  Connect Bank Account
                </button>
              )}
            </div>
            
            <div className="connection-card">
              <div className="connection-icon">💳</div>
              <h3>Credit Card</h3>
              <p>Link your credit cards for expense tracking</p>
              
              {selectedAccountType === 'credit' ? (
                <div className="account-form">
                  <input
                    type="text"
                    placeholder="Cardholder Name"
                    value={cardForm.name}
                    onChange={(e) => setCardForm({...cardForm, name: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="Card Number"
                    value={cardForm.number}
                    onChange={(e) => setCardForm({...cardForm, number: e.target.value})}
                  />
                  <div className="card-row">
                    <input
                      type="text"
                      placeholder="MM"
                      value={cardForm.expMonth}
                      onChange={(e) => setCardForm({...cardForm, expMonth: e.target.value})}
                      maxLength="2"
                    />
                    <input
                      type="text"
                      placeholder="YYYY"
                      value={cardForm.expYear}
                      onChange={(e) => setCardForm({...cardForm, expYear: e.target.value})}
                      maxLength="4"
                    />
                    <input
                      type="text"
                      placeholder="CVC"
                      value={cardForm.cvc}
                      onChange={(e) => setCardForm({...cardForm, cvc: e.target.value})}
                      maxLength="4"
                    />
                  </div>
                  <div className="form-buttons">
                    <button 
                      className="connect-btn secondary"
                      onClick={() => handleAccountConnection('credit')}
                      disabled={loading || !cardForm.name || !cardForm.number || !cardForm.expMonth || !cardForm.expYear || !cardForm.cvc}
                    >
                      {loading ? 'Connecting...' : 'Connect Credit Card'}
                    </button>
                    <button 
                      className="connect-btn cancel"
                      onClick={() => setSelectedAccountType('')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  className="connect-btn secondary"
                  onClick={() => setSelectedAccountType('credit')}
                >
                  Connect Credit Card
                </button>
              )}
            </div>
            
            <div className="connection-card">
              <div className="connection-icon">💰</div>
              <h3>Debit Card</h3>
              <p>Connect your debit card for real-time tracking</p>
              
              {selectedAccountType === 'debit' ? (
                <div className="account-form">
                  <input
                    type="text"
                    placeholder="Cardholder Name"
                    value={cardForm.name}
                    onChange={(e) => setCardForm({...cardForm, name: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="Card Number"
                    value={cardForm.number}
                    onChange={(e) => setCardForm({...cardForm, number: e.target.value})}
                  />
                  <div className="card-row">
                    <input
                      type="text"
                      placeholder="MM"
                      value={cardForm.expMonth}
                      onChange={(e) => setCardForm({...cardForm, expMonth: e.target.value})}
                      maxLength="2"
                    />
                    <input
                      type="text"
                      placeholder="YYYY"
                      value={cardForm.expYear}
                      onChange={(e) => setCardForm({...cardForm, expYear: e.target.value})}
                      maxLength="4"
                    />
                    <input
                      type="text"
                      placeholder="CVC"
                      value={cardForm.cvc}
                      onChange={(e) => setCardForm({...cardForm, cvc: e.target.value})}
                      maxLength="4"
                    />
                  </div>
                  <div className="form-buttons">
                    <button 
                      className="connect-btn secondary"
                      onClick={() => handleAccountConnection('debit')}
                      disabled={loading || !cardForm.name || !cardForm.number || !cardForm.expMonth || !cardForm.expYear || !cardForm.cvc}
                    >
                      {loading ? 'Connecting...' : 'Connect Debit Card'}
                    </button>
                    <button 
                      className="connect-btn cancel"
                      onClick={() => setSelectedAccountType('')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  className="connect-btn secondary"
                  onClick={() => setSelectedAccountType('debit')}
                >
                  Connect Debit Card
                </button>
              )}
            </div>
          </div>
          
          <div className="connection-footer">
            <div className="security-info">
              <div className="security-icon">🔒</div>
              <div>
                <h4>Bank-level Security</h4>
                <p>Your data is encrypted and protected with 256-bit SSL encryption</p>
              </div>
            </div>
            
            <button 
              className="skip-btn"
              onClick={() => setShowAccountConnection(false)}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (showAccountConnection) {
    return <AccountConnectionPage />;
  }

  const handleSignOut = async () => {
    await signOut();
  };

  // Enhanced handlers using new backend functions
  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!authUser) return;
    
    const res = await createIncomeStream(authUser.uid, {
      name: incomeForm.name,
      amount: Number(incomeForm.amount),
      frequency: incomeForm.frequency,
      isRecurring: incomeForm.isRecurring
    });
    
    if (res.error) {
      alert(res.error);
    } else {
      setIncomeForm({ userId: '', name: '', amount: '', frequency: 'monthly', isRecurring: true });
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!authUser) return;
    
    const res = await createSavingsGoal(authUser.uid, {
      name: goalForm.name,
      targetAmount: Number(goalForm.targetAmount),
      currentAmount: Number(goalForm.currentAmount),
      deadline: goalForm.deadline,
      priority: goalForm.priority,
      category: goalForm.category
    });
    
    if (res.error) {
      alert(res.error);
    } else {
      setGoalForm({ 
        userId: '', 
        name: '', 
        targetAmount: '', 
        currentAmount: '', 
        deadline: '', 
        priority: 'medium',
        category: 'general'
      });
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    console.log('handleAddExpense called', { authUser, expenseForm });
    
    if (!authUser) {
      alert('Please log in to add expenses.');
      return;
    }
    
    if (!expenseForm.name || !expenseForm.amount) {
      alert('Please fill in both title and amount.');
      return;
    }
    
    console.log('Attempting to add expense:', expenseForm);
    
    const res = await addExpense(authUser.uid, {
      name: expenseForm.name,
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      frequency: expenseForm.frequency,
      isRecurring: expenseForm.isRecurring,
      date: expenseForm.date || new Date().toISOString().split('T')[0],
      description: expenseForm.description
    });
    
    console.log('Add expense result:', res);
    
    if (res.error) {
      alert(res.error);
    } else {
      alert('Expense added successfully!');
      setExpenseForm({ 
        userId: '', 
        name: '', 
        amount: '', 
        category: 'general', 
        date: new Date().toISOString().split('T')[0],
        description: '',
        frequency: 'one-time',
        isRecurring: false
      });
      setShowExpenseModal(false);
    }
  };
  // Deposit handler using recordDeposit
  // Delete handlers
  const handleDelete = async (col, id) => {
    await deleteDoc(doc(db, col, id));
    await fetchAll();
  };

  if (!authUser && !showAccountConnection) {
    return (
      <div className="App app-bg">
        <header className="App-header card">
          <h1>Budget Savings App</h1>
          
          <form className="auth-form" onSubmit={handleAuth} style={{ marginBottom: 16 }}>
            {authMode === 'signup' && (
              <>
                {/* Verification Method Selection */}
                <div className="verification-method">
                  <label>Choose verification method:</label>
                  <div className="method-options">
                    <label>
                      <input
                        type="radio"
                        name="verificationMethod"
                        value="email"
                        checked={authForm.verificationMethod === 'email'}
                        onChange={e => setAuthForm(f => ({ ...f, verificationMethod: e.target.value }))}
                      />
                      Email Verification
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="verificationMethod"
                        value="phone"
                        checked={authForm.verificationMethod === 'phone'}
                        onChange={e => setAuthForm(f => ({ ...f, verificationMethod: e.target.value }))}
                      />
                      Phone Verification
                    </label>
                  </div>
                </div>

                {authForm.verificationMethod === 'phone' && (
                  <input
                    type="tel"
                    placeholder="Phone Number (e.g. +1234567890)"
                    value={authForm.phone}
                    onChange={e => setAuthForm(f => ({ ...f, phone: e.target.value }))}
                    required
                  />
                )}

                {confirmationResult && authForm.verificationMethod === 'phone' && (
                  <input
                    type="text"
                    placeholder="Enter verification code from SMS"
                    value={authForm.code}
                    onChange={e => setAuthForm(f => ({ ...f, code: e.target.value }))}
                    required
                  />
                )}
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
              required
            />
            
            {authMode === 'signup' && (
              <input
                type="password"
                placeholder="Confirm Password"
                value={authForm.confirmPassword}
                onChange={e => setAuthForm(f => ({ ...f, confirmPassword: e.target.value }))}
                required
              />
            )}

            <button type="submit">
              {authForm.verificationMethod === 'phone' && !confirmationResult && authMode === 'signup'
                ? 'Send SMS Code'
                : authMode === 'signup' ? 'Sign Up' : 'Login'}
            </button>
            
            {/* Switch between login and signup */}
            <div className="auth-switch" style={{ marginTop: 16, textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {authMode === 'login' 
                    ? "Don't have an account? " 
                    : "Already have an account? "}
                </span>
                <button 
                  type="button"
                  className="switch-mode-btn"
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  style={{ 
                    background: '#2563eb',
                    border: 'none', 
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    marginLeft: '8px'
                  }}
                >
                  {authMode === 'login' ? 'Sign up here' : 'Log in here'}
                </button>
              </div>
              
              <button 
                className="forgot-password-btn" 
                onClick={handleForgotPassword}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#2563eb', 
                  textDecoration: 'underline', 
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Forgot password?
              </button>
            </div>
            
            {authMode === 'signup' && authForm.verificationMethod === 'phone' && (
              <div id="recaptcha-container"></div>
            )}
          </form>
          
          {verificationSent && authMode === 'signup' && authForm.verificationMethod === 'email' && (
            <div style={{ color: '#2563eb', marginBottom: 8 }}>
              Verification email sent! Please check your inbox and verify before signing in.
            </div>
          )}
          {verificationSent && authMode === 'signup' && authForm.verificationMethod === 'phone' && (
            <div style={{ color: '#2563eb', marginBottom: 8 }}>
              Verification code sent to your phone. Enter the code above to continue.
            </div>
          )}
          {resetSent && (
            <div style={{ color: '#2563eb', marginBottom: 8 }}>
              Password reset link sent! Please check your email.
            </div>
          )}
          {authError && <p style={{ color: 'red' }}>{authError}</p>}
        </header>
      </div>
    );
  }

  return (
    <div className="App app-bg">
      <div className="dashboard-layout">
        {/* Main Content */}
        <main className="main-content">
          {/* Motivational Pop Message */}
          {showMotivation && (
            <div className="motivation-pop" onClick={() => setShowMotivation(false)}>
              🎉 Keep going! You've saved ${goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0)} so far! Every step counts.
            </div>
          )}
          
          <div className="dashboard-header">
            <h1>Financial Dashboard</h1>
            <p>Track your expenses, achieve your savings goals, and build wealth</p>
            <div className="action-buttons">
              <button className="btn-primary expense-btn" onClick={() => setShowExpenseModal(true)}>Add Expense</button>
              <button className="btn-success savings-btn">Add to Savings</button>
              <button className="btn-insights">View Insights</button>
              <button className="btn-debug" onClick={() => console.log('Auth User:', authUser, 'Modal State:', showExpenseModal)}>Debug</button>
            </div>
          </div>
          
          <div className="dashboard-summary-grid">
            <div className="summary-card income">
              <div className="summary-icon">📈</div>
              <div className="summary-content">
                <div className="summary-title">Monthly Income</div>
                <div className="summary-value">${monthlyData.income.toFixed(0)}</div>
                <div className="summary-trend positive">+12% from last month</div>
              </div>
            </div>
            <div className="summary-card expenses">
              <div className="summary-icon">📉</div>
              <div className="summary-content">
                <div className="summary-title">Monthly Expenses</div>
                <div className="summary-value">${monthlyData.expenses.toFixed(0)}</div>
                <div className="summary-trend negative">-5% from last month</div>
              </div>
            </div>
            <div className="summary-card balance">
              <div className="summary-icon">💰</div>
              <div className="summary-content">
                <div className="summary-title">Monthly Balance</div>
                <div className="summary-value">${monthlyData.balance.toFixed(0)}</div>
                <div className="summary-trend">Positive balance</div>
              </div>
            </div>
            <div className="summary-card savings">
              <div className="summary-icon">🎯</div>
              <div className="summary-content">
                <div className="summary-title">Total Savings</div>
                <div className="summary-value">${monthlyData.savingsTotal.toFixed(0)}</div>
                <div className="summary-trend positive">+8% this month</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-sections">
            <section className="card progress-section">
              <h2>🎯 Savings Progress</h2>
              {goals.length === 0 ? (
                <p>No goals yet. Create your first savings goal to get started!</p>
              ) : (
                goals.map(goal => {
                  const progress = calculateGoalProgress(goal.currentAmount, goal.targetAmount);
                  const daysLeft = getDaysUntilDeadline(goal.deadline);
                  const isOverdue = isGoalOverdue(goal.deadline);
                  
                  return (
                    <div key={goal.id} className="goal-card">
                      <div className="goal-header">
                        <div className="goal-info">
                          <h3>{goal.name}</h3>
                          <div className="goal-badges">
                            <span className={`priority-badge ${goal.priority}`}>{goal.priority} priority</span>
                            {goal.category && <span className="category-badge">{goal.category}</span>}
                          </div>
                        </div>
                        <div className="goal-amount">
                          <span className="current">${goal.currentAmount}</span> / <span className="target">${goal.targetAmount}</span>
                        </div>
                      </div>
                      
                      <div className="progress-bar-bg">
                        <div 
                          className="progress-bar-fill" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      
                      <div className="goal-footer">
                        <span className="progress-percentage">{progress.toFixed(1)}% complete</span>
                        {goal.deadline && (
                          <span className={`deadline ${isOverdue ? 'overdue' : ''}`}>
                            {isOverdue ? `${Math.abs(daysLeft)} days overdue` : 
                             daysLeft > 0 ? `Target: ${new Date(goal.deadline).toLocaleDateString()}` : 'Due today'}
                          </span>
                        )}
                      </div>
                      
                      {goal.category === 'emergency' && (
                        <div className="goal-description">
                          6 months of expenses for financial security
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>
            
            <section className="card insights-section">
              <h2>💡 Financial Insights</h2>
              {financialInsights.length === 0 ? (
                <div className="no-insights">
                  <p>Add more financial data to see personalized insights!</p>
                </div>
              ) : (
                <div className="insights-list">
                  {financialInsights.map((insight, index) => (
                    <div key={index} className={`insight-card ${insight.type}`}>
                      <div className="insight-header">
                        <span className="insight-icon">
                          {insight.type === 'warning' ? '⚠️' : 
                           insight.type === 'success' ? '✅' : '💡'}
                        </span>
                        <h4>{insight.title}</h4>
                      </div>
                      <p>{insight.message}</p>
                      <div className="insight-action">
                        💡 {insight.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          
          {/* User Info Section */}
          <section className="card user-info-section">
            <div className="user-info-content">
              <div className="user-details">
                <h3>Account Information</h3>
                <p>Logged in as: <strong>{authUser.email}</strong></p>
              </div>
              <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
            </div>
          </section>

          {/* Add Expense Modal */}
          {showExpenseModal && (
            <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
              <div className="modal-content expense-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Add Quick Expense</h2>
                  <button className="modal-close" onClick={() => setShowExpenseModal(false)}>×</button>
                </div>
                
                <form onSubmit={handleAddExpense} className="expense-form">
                  <div className="form-group">
                    <label htmlFor="expense-title">Title</label>
                    <input
                      id="expense-title"
                      type="text"
                      placeholder="What did you spend on?"
                      value={expenseForm.name}
                      onChange={e => setExpenseForm(f => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="expense-amount">Amount</label>
                      <input
                        id="expense-amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseForm.amount}
                        onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="expense-category">Category</label>
                      <select
                        id="expense-category"
                        value={expenseForm.category}
                        onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                      >
                        <option value="general">Select category</option>
                        <option value="food">Food & Dining</option>
                        <option value="transportation">Transportation</option>
                        <option value="utilities">Utilities</option>
                        <option value="entertainment">Entertainment</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="shopping">Shopping</option>
                        <option value="education">Education</option>
                        <option value="travel">Travel</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="expense-date">Date</label>
                    <input
                      id="expense-date"
                      type="date"
                      value={expenseForm.date}
                      onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="expense-description">Description (Optional)</label>
                    <textarea
                      id="expense-description"
                      placeholder="Additional details..."
                      value={expenseForm.description}
                      onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                      rows="3"
                    />
                  </div>

                  <button type="submit" className="add-expense-btn">
                    Add Expense
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
