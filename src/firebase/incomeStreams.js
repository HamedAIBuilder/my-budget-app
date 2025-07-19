import { db } from './config';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';

// Create a new income stream
export async function createIncomeStream(userId, incomeData) {
  try {
    const docRef = await addDoc(collection(db, 'incomeStreams'), { 
      ...incomeData, 
      userId,
      createdAt: new Date(),
      isRecurring: incomeData.isRecurring || false,
      frequency: incomeData.frequency || 'monthly' // monthly, weekly, yearly
    });
    return { id: docRef.id };
  } catch (error) {
    return { error: 'Failed to create income stream.' };
  }
}

// Fetch all income streams for a user (real-time)
export function getIncomeStreams(userId, callback) {
  try {
    const q = query(
      collection(db, 'incomeStreams'), 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
      const incomes = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(incomes);
    });
  } catch (error) {
    callback([], 'Failed to fetch income streams.');
    return null;
  }
}

// Update an income stream
export async function updateIncomeStream(userId, incomeId, updatedData) {
  try {
    const incomeRef = doc(db, 'incomeStreams', incomeId);
    await updateDoc(incomeRef, updatedData);
    return { success: true };
  } catch (error) {
    return { error: 'Failed to update income stream.' };
  }
}

// Delete an income stream
export async function deleteIncomeStream(userId, incomeId) {
  try {
    await deleteDoc(doc(db, 'incomeStreams', incomeId));
    return { success: true };
  } catch (error) {
    return { error: 'Failed to delete income stream.' };
  }
}

// Calculate monthly income total
export function calculateMonthlyIncome(incomeStreams) {
  return incomeStreams.reduce((total, income) => {
    if (income.frequency === 'monthly' || !income.frequency) {
      return total + (income.amount || 0);
    } else if (income.frequency === 'weekly') {
      return total + (income.amount || 0) * 4.33; // Average weeks per month
    } else if (income.frequency === 'yearly') {
      return total + (income.amount || 0) / 12;
    }
    return total;
  }, 0);
}
