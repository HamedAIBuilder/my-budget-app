import { db } from './config';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';

// Add a new expense
export async function addExpense(userId, expenseData) {
  try {
    const docRef = await addDoc(collection(db, 'expenses'), { 
      ...expenseData, 
      userId,
      createdAt: new Date(),
      category: expenseData.category || 'general',
      isRecurring: expenseData.isRecurring || false,
      frequency: expenseData.frequency || 'monthly' // monthly, weekly, yearly, one-time
    });
    return { id: docRef.id };
  } catch (error) {
    return { error: 'Failed to add expense.' };
  }
}

// Fetch all expenses for a user (real-time)
export function getExpenses(userId, callback) {
  try {
    const q = query(
      collection(db, 'expenses'), 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
      const expenses = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(expenses);
    });
  } catch (error) {
    callback([], 'Failed to fetch expenses.');
    return null;
  }
}

// Update an expense
export async function updateExpense(userId, expenseId, updatedData) {
  try {
    const expenseRef = doc(db, 'expenses', expenseId);
    await updateDoc(expenseRef, updatedData);
    return { success: true };
  } catch (error) {
    return { error: 'Failed to update expense.' };
  }
}

// Delete an expense
export async function deleteExpense(userId, expenseId) {
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
    return { success: true };
  } catch (error) {
    return { error: 'Failed to delete expense.' };
  }
}

// Calculate monthly expenses total
export function calculateMonthlyExpenses(expenses) {
  return expenses.reduce((total, expense) => {
    if (expense.frequency === 'monthly' || !expense.frequency) {
      return total + (expense.amount || 0);
    } else if (expense.frequency === 'weekly') {
      return total + (expense.amount || 0) * 4.33; // Average weeks per month
    } else if (expense.frequency === 'yearly') {
      return total + (expense.amount || 0) / 12;
    } else if (expense.frequency === 'one-time') {
      // Only count if it's from this month
      const expenseDate = new Date(expense.createdAt);
      const currentDate = new Date();
      if (expenseDate.getMonth() === currentDate.getMonth() && 
          expenseDate.getFullYear() === currentDate.getFullYear()) {
        return total + (expense.amount || 0);
      }
    }
    return total;
  }, 0);
}

// Get expenses by category
export function getExpensesByCategory(expenses) {
  const categories = {};
  expenses.forEach(expense => {
    const category = expense.category || 'general';
    categories[category] = (categories[category] || 0) + (expense.amount || 0);
  });
  return categories;
}
