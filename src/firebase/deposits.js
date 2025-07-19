import { db } from './config';
import { collection, addDoc, serverTimestamp, doc, runTransaction, onSnapshot, query, where } from 'firebase/firestore';

// Record a deposit and atomically update the goal's currentAmount
export async function recordDeposit(userId, goalId, amount) {
  try {
    await runTransaction(db, async (transaction) => {
      const goalRef = doc(db, 'savingsGoals', goalId);
      const goalSnap = await transaction.get(goalRef);
      if (!goalSnap.exists()) throw new Error('Goal not found');
      const goal = goalSnap.data();
      if (amount < 0) throw new Error('Withdrawals are not allowed before the target date.');
      // Add deposit
      const depositRef = collection(db, 'deposits');
      transaction.set(addDoc(depositRef, {
        userId,
        goalId,
        amount,
        date: serverTimestamp()
      }), {});
      // Atomically increment currentAmount
      transaction.update(goalRef, {
        currentAmount: (goal.currentAmount || 0) + amount
      });
    });
    return { success: true };
  } catch (error) {
    return { error: error.message || 'Failed to record deposit.' };
  }
}

// Real-time listener for all deposits for a specific goal
export function getDepositsForGoal(userId, goalId, callback) {
  try {
    const q = query(
      collection(db, 'deposits'),
      where('userId', '==', userId),
      where('goalId', '==', goalId)
    );
    return onSnapshot(q, snapshot => {
      const deposits = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(deposits);
    });
  } catch (error) {
    callback([], 'Failed to fetch deposits.');
    return null;
  }
}
