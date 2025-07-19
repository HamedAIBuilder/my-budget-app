import React, { useEffect, useState } from 'react';
import './App.css';
import { db } from './firebase/config';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { signUp, signIn, signOut, onAuthStateChangedListener, setupRecaptcha, signInWithPhone, confirmPhoneCode, sendVerificationEmail, resetPassword } from './firebase/auth';
import { recordDeposit } from './firebase/deposits';
import { getIncomeStreams, createIncomeStream, calculateMonthlyIncome } from './firebase/incomeStreams';
import { getSavingsGoals, createSavingsGoal, calculateGoalProgress, getDaysUntilDeadline, isGoalOverdue } from './firebase/savingsGoals';
import { getExpenses, addExpense, calculateMonthlyExpenses, getExpensesByCategory } from './firebase/expenses';
import { generateFinancialInsights, getMonthlySummaries, calculatePercentageChange } from './firebase/analytics';

function App() {
  const [users, setUsers] = useState([]);
  const [incomeStreams, setIncomeStreams] = useState([]);
  const [goals, setGoals] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authForm, setAuthForm] = useState({ method: 'email', email: '', phone: '', password: '', code: '' });
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authError, setAuthError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [resetSent, setResetSent] = useState(false);

  // Additional state for WealthWise features
  const [monthlyData, setMonthlyData] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
    savingsTotal: 0
  });
  const [previousMonthData, setPreviousMonthData] = useState({
    income: 0,
    expenses: 0,
    balance: 0
  });
  const [financialInsights, setFinancialInsights] = useState([]);
  const [monthlySummaries, setMonthlySummaries] = useState([]);

  // UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showMotivation, setShowMotivation] = useState(true);

  // Form state
  const [userForm, setUserForm] = useState({ name: '', email: '' });
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
  const [depositForm, setDepositForm] = useState({ userId: '', goalId: '', amount: '', date: '' });
  const [expenseForm, setExpenseForm] = useState({ 
    userId: '', 
    name: '', 
    amount: '', 
    category: 'general', 
    date: '',
    frequency: 'one-time',
    isRecurring: false
  });
  const [depositResult, setDepositResult] = useState('');

  // Enhanced data fetching with real-time updates
  const fetchAll = async () => {
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
  };

  // Update monthly data calculations
  const updateMonthlyData = (incomes, userExpenses, savingsGoals) => {
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
  };

  useEffect(() => { 
    if (authUser) {
      fetchAll(); 
    }
  }, [authUser]);

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
    if (authForm.method === 'email') {
      if (authMode === 'register') {
        const res = await signUp(authForm.email, authForm.password);
        if (res.error) setAuthError(res.error);
        else {
          await sendVerificationEmail(res.user);
          setVerificationSent(true);
        }
      } else {
        const res = await signIn(authForm.email, authForm.password);
        if (res.error) setAuthError(res.error);
        else if (!res.user.emailVerified) {
          setAuthError('Please verify your email before signing in.');
        }
      }
    } else if (authForm.method === 'phone') {
      if (!confirmationResult) {
        // Send code
        const recaptcha = setupRecaptcha();
        const res = await signInWithPhone(authForm.phone, recaptcha);
        if (res.error) setAuthError(res.error);
        else {
          setConfirmationResult(res.confirmationResult);
          setVerificationSent(true);
        }
      } else {
        // Confirm code
        const res = await confirmPhoneCode(confirmationResult, authForm.code);
        if (res.error) setAuthError(res.error);
      }
    }
  };

  const handleForgotPassword = async e => {
    e.preventDefault();
    setAuthError('');
    setResetSent(false);
    if (authForm.method === 'email') {
      const res = await resetPassword(authForm.email);
      if (res.error) setAuthError(res.error);
      else setResetSent(true);
    } else {
      setAuthError('Password reset via phone is not supported by Firebase. Please use email.');
    }
  };
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
    if (!authUser) return;
    
    const res = await addExpense(authUser.uid, {
      name: expenseForm.name,
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      frequency: expenseForm.frequency,
      isRecurring: expenseForm.isRecurring,
      date: expenseForm.date || new Date().toISOString().split('T')[0]
    });
    
    if (res.error) {
      alert(res.error);
    } else {
      setExpenseForm({ 
        userId: '', 
        name: '', 
        amount: '', 
        category: 'general', 
        date: '',
        frequency: 'one-time',
        isRecurring: false
      });
    }
  };
  // Deposit handler using recordDeposit
  const handleRecordDeposit = async e => {
    e.preventDefault();
    setDepositResult('');
    const { userId, goalId, amount } = depositForm;
    const res = await recordDeposit(userId, goalId, Number(amount));
    if (res.error) setDepositResult(res.error);
    else setDepositResult('Deposit recorded!');
    await fetchAll();
    setDepositForm({ userId: '', goalId: '', amount: '', date: '' });
  };
  // Delete handlers
  const handleDelete = async (col, id) => {
    await deleteDoc(doc(db, col, id));
    await fetchAll();
  };

  if (!authUser) {
    return (
      <div className="App app-bg">
        <header className="App-header card">
          <h1>Budget Savings App</h1>
          <div style={{ marginBottom: 12 }}>
            <button className={authForm.method === 'email' ? 'switch-auth' : ''} onClick={() => setAuthForm(f => ({ ...f, method: 'email' }))}>Email</button>
            <button className={authForm.method === 'phone' ? 'switch-auth' : ''} onClick={() => setAuthForm(f => ({ ...f, method: 'phone' }))} style={{ marginLeft: 8 }}>Phone</button>
          </div>
          <form className="auth-form" onSubmit={handleAuth} style={{ marginBottom: 16 }}>
            {authForm.method === 'email' ? (
              <>
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
              </>
            ) : (
              <>
                <input
                  type="tel"
                  placeholder="Phone (e.g. +1234567890)"
                  value={authForm.phone}
                  onChange={e => setAuthForm(f => ({ ...f, phone: e.target.value }))}
                  required
                />
                {confirmationResult && (
                  <input
                    type="text"
                    placeholder="Verification code"
                    value={authForm.code}
                    onChange={e => setAuthForm(f => ({ ...f, code: e.target.value }))}
                    required
                  />
                )}
                <div id="recaptcha-container"></div>
              </>
            )}
            <button type="submit">
              {authForm.method === 'phone' && !confirmationResult
                ? 'Send Code'
                : authMode === 'register' ? 'Register' : 'Login'}
            </button>
          </form>
          <button className="switch-auth" onClick={() => setAuthMode(m => (m === 'login' ? 'register' : 'login'))}>
            {authMode === 'login' ? 'Register here' : 'Sign in here'}
          </button>
          <button className="switch-auth" style={{ marginTop: 8 }} onClick={handleForgotPassword}>
            Forgot password?
          </button>
          {verificationSent && authForm.method === 'email' && authMode === 'register' && (
            <div style={{ color: '#2563eb', marginBottom: 8 }}>
              Verification email sent! Please check your inbox and verify before signing in.
            </div>
          )}
          {verificationSent && authForm.method === 'phone' && (
            <div style={{ color: '#2563eb', marginBottom: 8 }}>
              Verification code sent to your phone. Enter the code above to complete sign in.
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
        {/* Sidebar Navigation */}
        <aside className="sidebar">
          <div className="sidebar-title">WealthWise</div>
          <nav>
            <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
            <button className={activeTab === 'goals' ? 'active' : ''} onClick={() => setActiveTab('goals')}>Goals</button>
            <button className={activeTab === 'income' ? 'active' : ''} onClick={() => setActiveTab('income')}>Income</button>
            <button className={activeTab === 'expenses' ? 'active' : ''} onClick={() => setActiveTab('expenses')}>Expenses</button>
            <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
          </nav>
          <div className="sidebar-footer">Logged in as:<br />{authUser.email}
            <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
          </div>
        </aside>
        {/* Main Content */}
        <main className="main-content">
          {/* Motivational Pop Message */}
          {showMotivation && (
            <div className="motivation-pop" onClick={() => setShowMotivation(false)}>
              🎉 Keep going! You've saved ${goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0)} so far! Every step counts.
            </div>
          )}
          {activeTab === 'dashboard' && (
            <>
              <div className="dashboard-header">
                <h1>Financial Dashboard</h1>
                <p>Track your expenses, achieve your savings goals, and build wealth</p>
                <div className="action-buttons">
                  <button className="btn-primary expense-btn">Add Expense</button>
                  <button className="btn-success savings-btn">Add to Savings</button>
                  <button className="btn-insights">View Insights</button>
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
            </>
          )}
          {activeTab === 'goals' && (
            <section className="card">
              <h2>Savings Goals</h2>
              <form className="form-row" onSubmit={handleAddGoal}>
                <input placeholder="Goal Name" value={goalForm.name} onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))} required />
                <input placeholder="Target Amount" type="number" value={goalForm.targetAmount} onChange={e => setGoalForm(f => ({ ...f, targetAmount: e.target.value }))} required />
                <input placeholder="Current Amount" type="number" value={goalForm.currentAmount} onChange={e => setGoalForm(f => ({ ...f, currentAmount: e.target.value }))} />
                <input placeholder="Deadline (YYYY-MM-DD)" type="date" value={goalForm.deadline} onChange={e => setGoalForm(f => ({ ...f, deadline: e.target.value }))} />
                <select value={goalForm.priority} onChange={e => setGoalForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
                <select value={goalForm.category} onChange={e => setGoalForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="general">General</option>
                  <option value="emergency">Emergency Fund</option>
                  <option value="vacation">Vacation</option>
                  <option value="investment">Investment</option>
                  <option value="education">Education</option>
                  <option value="house">House/Property</option>
                </select>
                <button type="submit">Add Goal</button>
              </form>
              {goals.length === 0 ? <p>No savings goals found.</p> : (
                <div className="goals-list">
                  {goals.map(goal => (
                    <div key={goal.id} className="goal-item">
                      <div className="goal-summary">
                        <strong>{goal.name}</strong>: ${goal.currentAmount} / ${goal.targetAmount}
                        <span className={`priority-badge ${goal.priority}`}>{goal.priority}</span>
                        <span className="category-badge">{goal.category}</span>
                      </div>
                      <button onClick={() => handleDelete('savingsGoals', goal.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'income' && (
            <section className="card">
              <h2>Income Streams</h2>
              <form className="form-row" onSubmit={handleAddIncome}>
                <input placeholder="Income Source Name" value={incomeForm.name} onChange={e => setIncomeForm(f => ({ ...f, name: e.target.value }))} required />
                <input placeholder="Amount" type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} required />
                <select value={incomeForm.frequency} onChange={e => setIncomeForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <label>
                  <input 
                    type="checkbox" 
                    checked={incomeForm.isRecurring} 
                    onChange={e => setIncomeForm(f => ({ ...f, isRecurring: e.target.checked }))} 
                  />
                  Recurring
                </label>
                <button type="submit">Add Income</button>
              </form>
              {incomeStreams.length === 0 ? <p>No income streams found.</p> : (
                <div className="income-list">
                  {incomeStreams.map(income => (
                    <div key={income.id} className="income-item">
                      <strong>{income.name}</strong>: ${income.amount} ({income.frequency})
                      {income.isRecurring && <span className="recurring-badge">Recurring</span>}
                      <button onClick={() => handleDelete('incomeStreams', income.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'expenses' && (
            <section className="card">
              <h2>Expenses</h2>
              <form className="form-row" onSubmit={handleAddExpense}>
                <input placeholder="Expense Name" value={expenseForm.name} onChange={e => setExpenseForm(f => ({ ...f, name: e.target.value }))} required />
                <input placeholder="Amount" type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} required />
                <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="general">General</option>
                  <option value="food">Food & Dining</option>
                  <option value="transportation">Transportation</option>
                  <option value="utilities">Utilities</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="shopping">Shopping</option>
                </select>
                <select value={expenseForm.frequency} onChange={e => setExpenseForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="one-time">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <input placeholder="Date" type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} />
                <label>
                  <input 
                    type="checkbox" 
                    checked={expenseForm.isRecurring} 
                    onChange={e => setExpenseForm(f => ({ ...f, isRecurring: e.target.checked }))} 
                  />
                  Recurring
                </label>
                <button type="submit">Add Expense</button>
              </form>
              {expenses.length === 0 ? <p>No expenses found.</p> : (
                <div className="expenses-list">
                  {expenses.map(expense => (
                    <div key={expense.id} className="expense-item">
                      <strong>{expense.name}</strong>: ${expense.amount} ({expense.category})
                      {expense.isRecurring && <span className="recurring-badge">Recurring</span>}
                      <button onClick={() => handleDelete('expenses', expense.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeTab === 'profile' && (
            <section className="card">
              <h2>Profile</h2>
              <p>Coming soon: User profile and analytics.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
