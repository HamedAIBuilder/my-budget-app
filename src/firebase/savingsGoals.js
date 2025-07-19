import { db } from './config';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';

// Create a new savings goal
export async function createSavingsGoal(userId, goalData) {
  try {
    const docRef = await addDoc(collection(db, 'savingsGoals'), { 
      ...goalData, 
      userId,
      createdAt: new Date(),
      priority: goalData.priority || 'medium', // high, medium, low
      deadline: goalData.deadline || null,
      category: goalData.category || 'general', // emergency, vacation, investment, etc.
      currentAmount: goalData.currentAmount || 0,
      isCompleted: false
    });
    return { id: docRef.id };
  } catch (error) {
    return { error: 'Failed to create savings goal.' };
  }
}

// Fetch all savings goals for a user (real-time)
export function getSavingsGoals(userId, callback) {
  try {
    const q = query(
      collection(db, 'savingsGoals'), 
      where('userId', '==', userId),
      orderBy('priority', 'desc'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
      const goals = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(goals);
    });
  } catch (error) {
    callback([], 'Failed to fetch savings goals.');
    return null;
  }
}

// Update a savings goal (not locked funds)
export async function updateSavingsGoal(userId, goalId, updatedData) {
  try {
    const goalRef = doc(db, 'savingsGoals', goalId);
    await updateDoc(goalRef, updatedData);
    return { success: true };
  } catch (error) {
    return { error: 'Failed to update savings goal.' };
  }
}

// Delete a savings goal (warn if deposits exist)
export async function deleteSavingsGoal(userId, goalId) {
  try {
    // Optionally, check for existing deposits here before deleting
    await deleteDoc(doc(db, 'savingsGoals', goalId));
    return { success: true };
  } catch (error) {
    return { error: 'Failed to delete savings goal.' };
  }
}

// Calculate goal completion percentage
export function calculateGoalProgress(currentAmount, targetAmount) {
  if (!targetAmount || targetAmount <= 0) return 0;
  return Math.min(100, (currentAmount / targetAmount) * 100);
}

// Get days until deadline
export function getDaysUntilDeadline(deadline) {
  if (!deadline) return null;
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const timeDiff = deadlineDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return daysDiff;
}

// Check if goal is overdue
export function isGoalOverdue(deadline) {
  if (!deadline) return false;
  const deadlineDate = new Date(deadline);
  const today = new Date();
  return deadlineDate < today;
}
