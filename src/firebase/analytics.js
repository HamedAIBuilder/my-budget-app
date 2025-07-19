import { db } from './config';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

// Create monthly financial summary
export async function createMonthlySummary(userId, summaryData) {
  try {
    const docRef = await addDoc(collection(db, 'monthlySummaries'), {
      ...summaryData,
      userId,
      month: summaryData.month || new Date().getMonth() + 1,
      year: summaryData.year || new Date().getFullYear(),
      createdAt: new Date()
    });
    return { id: docRef.id };
  } catch (error) {
    return { error: 'Failed to create monthly summary.' };
  }
}

// Get monthly summaries for trend analysis
export async function getMonthlySummaries(userId, months = 6) {
  try {
    const currentDate = new Date();
    const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - months + 1, 1);
    
    const q = query(
      collection(db, 'monthlySummaries'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    const summaries = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    
    return summaries.filter(summary => {
      const summaryDate = new Date(summary.year, summary.month - 1, 1);
      return summaryDate >= startDate;
    }).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  } catch (error) {
    return [];
  }
}

// Calculate percentage change between months
export function calculatePercentageChange(current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

// Calculate monthly expenses total
export function calculateMonthlyExpenses(expenses) {
  if (!expenses || !Array.isArray(expenses)) return 0;
  
  return expenses.reduce((total, expense) => {
    if (!expense.amount) return total;
    
    // Convert different frequencies to monthly amounts
    switch (expense.frequency) {
      case 'weekly':
        return total + (expense.amount * 4.33); // Average weeks per month
      case 'yearly':
        return total + (expense.amount / 12);
      case 'daily':
        return total + (expense.amount * 30); // Average days per month
      case 'monthly':
      case 'one-time':
      default:
        return total + expense.amount;
    }
  }, 0);
}

// Generate financial insights based on user data
export function generateFinancialInsights(incomeStreams, expenses, savingsGoals, monthlySummaries) {
  const insights = [];
  
  // Calculate totals
  const monthlyIncome = incomeStreams.reduce((sum, income) => sum + (income.amount || 0), 0);
  const monthlyExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const totalSavings = savingsGoals.reduce((sum, goal) => sum + (goal.currentAmount || 0), 0);
  const savingsRate = monthlyIncome > 0 ? (totalSavings / monthlyIncome) * 100 : 0;
  
  // Savings rate insight
  if (savingsRate < 20) {
    insights.push({
      type: 'warning',
      title: 'Increase Savings Rate',
      message: `Your current savings rate is ${savingsRate.toFixed(1)}%. Aim for at least 20% of income.`,
      action: 'Review and reduce expenses'
    });
  } else if (savingsRate > 20) {
    insights.push({
      type: 'success',
      title: 'Great Savings Rate!',
      message: `You're saving ${savingsRate.toFixed(1)}% of your income. Keep it up!`,
      action: 'Consider increasing investment goals'
    });
  }
  
  // Expense analysis
  const expenseCategories = {};
  expenses.forEach(expense => {
    const category = expense.category || 'general';
    expenseCategories[category] = (expenseCategories[category] || 0) + (expense.amount || 0);
  });
  
  const highestExpenseCategory = Object.entries(expenseCategories)
    .sort(([,a], [,b]) => b - a)[0];
  
  if (highestExpenseCategory && highestExpenseCategory[1] > monthlyIncome * 0.3) {
    insights.push({
      type: 'warning',
      title: 'High Expense Category',
      message: `${highestExpenseCategory[0]} accounts for ${((highestExpenseCategory[1] / monthlyIncome) * 100).toFixed(1)}% of your income.`,
      action: 'Consider reducing expenses in this category'
    });
  }
  
  // Savings goals progress
  const overdueGoals = savingsGoals.filter(goal => {
    if (!goal.deadline) return false;
    const deadline = new Date(goal.deadline);
    return deadline < new Date() && goal.currentAmount < goal.targetAmount;
  });
  
  if (overdueGoals.length > 0) {
    insights.push({
      type: 'warning',
      title: 'Overdue Savings Goals',
      message: `You have ${overdueGoals.length} overdue savings goals.`,
      action: 'Review deadlines and adjust savings contributions'
    });
  }
  
  // Emergency fund check
  const emergencyFund = savingsGoals.find(goal => 
    goal.category === 'emergency' || goal.name.toLowerCase().includes('emergency')
  );
  
  const recommendedEmergencyFund = monthlyExpenses * 6;
  
  if (!emergencyFund || emergencyFund.currentAmount < recommendedEmergencyFund) {
    insights.push({
      type: 'info',
      title: 'Emergency Fund',
      message: `Aim for 6 months of expenses (${recommendedEmergencyFund.toFixed(0)}) in your emergency fund.`,
      action: 'Set up or increase emergency fund contributions'
    });
  }
  
  return insights;
}

// Update user's financial health score
export async function updateFinancialHealthScore(userId, score, factors) {
  try {
    const healthRef = doc(db, 'userHealthScores', userId);
    await updateDoc(healthRef, {
      score,
      factors,
      lastUpdated: new Date()
    });
    return { success: true };
  } catch (error) {
    // If document doesn't exist, create it
    try {
      await addDoc(collection(db, 'userHealthScores'), {
        userId,
        score,
        factors,
        lastUpdated: new Date()
      });
      return { success: true };
    } catch (createError) {
      return { error: 'Failed to update financial health score.' };
    }
  }
}
