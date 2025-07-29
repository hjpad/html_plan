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

// Helper to get a reference to the current user's workspaces collection
function getUserWorkspacesCollection(uid) {
    if (!uid) {
        console.error("Firestore Error: UID is required to access user's data.");
        return null;
    }
    return db.collection('users').doc(uid).collection('workspaces');
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
 * Saves or updates a workspace in Firestore for a specific user.
 * @param {string} uid The user's unique ID.
 * @param {object} workspace The workspace object to save. Must have an 'id' property.
 */
export async function saveWorkspaceToFirestore(uid, workspace) {
    if (!uid || !workspace || !workspace.id) {
        console.error("Firestore Save Error: Invalid UID or workspace data provided.", { uid, workspace });
        return;
    }
    try {
        await getUserWorkspacesCollection(uid).doc(workspace.id).set(workspace);
        console.log(`Workspace "${workspace.name}" (${workspace.id}) saved/updated successfully for user ${uid}.`);
    } catch (error) {
        console.error("Error saving workspace to Firestore:", error);
        throw error;
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
 * Deletes a workspace and all its associated projects and tasks.
 * @param {string} uid The user's unique ID.
 * @param {string} workspaceId The ID of the workspace to delete.
 */
export async function deleteWorkspaceAndContents(uid, workspaceId) {
    if (!uid || !workspaceId) {
        console.error("Firestore Delete Error: Invalid UID or workspaceId provided.");
        return;
    }
    const itemsCollection = getUserItemsCollection(uid);
    const batch = db.batch();

    try {
        // 1. Find all projects in the workspace
        const projectsSnapshot = await itemsCollection.where('workspaceId', '==', workspaceId).get();
        const projectIds = [];

        for (const projectDoc of projectsSnapshot.docs) {
            const projectId = projectDoc.id;
            projectIds.push(projectId);
            
            // 2. For each project, find all its tasks
            const tasksSnapshot = await itemsCollection.where('parentId', '==', projectId).get();
            tasksSnapshot.forEach(taskDoc => {
                // Add each task to the batch for deletion
                batch.delete(taskDoc.ref);
            });

            // Add the project itself to the batch for deletion
            batch.delete(projectDoc.ref);
        }

        // 3. Add the workspace document to the batch for deletion
        const workspaceRef = getUserWorkspacesCollection(uid).doc(workspaceId);
        batch.delete(workspaceRef);

        // 4. Commit the batch
        await batch.commit();
        console.log(`Workspace (${workspaceId}) and all its contents deleted successfully.`);

        return projectIds; // Return deleted project IDs for client-side cleanup
    } catch (error) {
        console.error("Error deleting workspace and its contents:", error);
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

/**
 * Loads all workspaces from Firestore for a specific user.
 * @param {string} uid The user's unique ID.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of workspace objects.
 */
export async function loadWorkspacesFromFirestore(uid) {
    if (!uid) {
        console.log("Firestore Load Info: No UID provided, returning empty array.");
        return [];
    }
    try {
        const querySnapshot = await getUserWorkspacesCollection(uid).get();
        const workspaces = [];
        querySnapshot.forEach(doc => {
            workspaces.push(doc.data());
        });
        console.log(`Loaded ${workspaces.length} workspaces for user ${uid} from Firestore.`);
        return workspaces;
    } catch (error) {
        console.error("Error loading workspaces from Firestore:", error);
        throw error;
    }
}