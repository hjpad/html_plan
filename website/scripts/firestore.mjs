// scripts/firestore.mjs

// Assuming firebase.firestore() is globally available after firebase-firestore-compat.js loads
const db = firebase.firestore();

// Helper to get a reference to the current user's items collection
function getUserItemsCollection(uid) {
    if (!uid) {
        console.error("Firestore Error: UID is required to access user's data.");
        return null;
    }
    return db.collection('users').doc(uid).collection('items');
}

/**
 * Saves or updates an item in Firestore for a specific user.
 * @param {string} uid The user's unique ID.
 * @param {object} item The item object to save. Must have an 'id' property.
 */
export async function saveItemToFirestore(uid, item) {
    if (!uid || !item || !item.id) {
        console.error("Firestore Save Error: Invalid UID or item data provided.", { uid, item });
        return;
    }
    try {
        await getUserItemsCollection(uid).doc(item.id).set(item);
        console.log(`Item "${item.title}" (${item.id}) saved/updated successfully for user ${uid}.`);
    } catch (error) {
        console.error("Error saving item to Firestore:", error);
        throw error; // Re-throw to be handled by the calling function
    }
}

/**
 * Deletes an item from Firestore for a specific user.
 * @param {string} uid The user's unique ID.
 * @param {string} itemId The ID of the item to delete.
 */
export async function deleteItemFromFirestore(uid, itemId) {
    if (!uid || !itemId) {
        console.error("Firestore Delete Error: Invalid UID or item ID provided.", { uid, itemId });
        return;
    }
    try {
        await getUserItemsCollection(uid).doc(itemId).delete();
        console.log(`Item (${itemId}) deleted successfully for user ${uid}.`);
    } catch (error) {
        console.error("Error deleting item from Firestore:", error);
        throw error;
    }
}

/**
 * Loads all items from Firestore for a specific user.
 * @param {string} uid The user's unique ID.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of item objects.
 */
export async function loadItemsFromFirestore(uid) {
    if (!uid) {
        console.log("Firestore Load Info: No UID provided, returning empty array.");
        return [];
    }
    try {
        const querySnapshot = await getUserItemsCollection(uid).get();
        const items = [];
        querySnapshot.forEach(doc => {
            items.push(doc.data());
        });
        console.log(`Loaded ${items.length} items for user ${uid} from Firestore.`);
        return items;
    } catch (error) {
        console.error("Error loading items from Firestore:", error);
        throw error;
    }
}