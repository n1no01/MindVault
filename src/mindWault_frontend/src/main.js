import { AuthClient } from "@dfinity/auth-client";
import { createActor, canisterId, mindWault_backend } from "../../declarations/mindWault_backend";
import { HttpAgent } from "@dfinity/agent";

let authClient;

// Initialize the authentication client
async function initAuthClient() {
  authClient = await AuthClient.create();
  
  // Check if the user is already authenticated
  const isAuthenticated = await authClient.isAuthenticated();
  if (isAuthenticated) {
    handleAuthenticatedUser();
  }
}

// Function to log in using Internet Identity
async function login() {
  authClient.login({
    identityProvider: "https://identity.ic0.app",
    onSuccess: async () => {
        handleAuthenticatedUser();
        document.getElementById("login").style.display = "none";
        document.getElementById("logout").style.display = "inline";
        await loadAndRenderNotes();
    },
    onError: (err) => {
      console.error("Login failed:", err);
    },
  });
}

// Function to log out
async function logout() {
    await authClient.logout();
    document.getElementById("login").style.display = "inline";
    document.getElementById("logout").style.display = "none";

      // Clear and remove notes wrapper if exists
    const notesWrapper = document.getElementById("notesWrapper");
    if (notesWrapper) {
      notesWrapper.innerHTML = ""; 
      notesWrapper.remove();
    }
}

// Handle authenticated user
async function handleAuthenticatedUser() {
  const identity = authClient.getIdentity();
  const principal = identity.getPrincipal().toText();
}

// Run authentication check on page load
window.onload = initAuthClient;

// Attach event listeners
document.getElementById("login").addEventListener("click", login);
document.getElementById("logout").addEventListener("click", logout);


  // <div id="notesWrapper">
  //   <div class="note-container">
  //    <input type="text" id="note-title" placeholder="Note Title" />
  //    <textarea id="note-content" placeholder="Write your note here..."></textarea>
  //    <div id="buttons">
  //      <button class="saveButton">Save Note</button>
  //      <button class="deleteButton" onclick="deleteNote()">Delete Note</button>
  //    </div>
  //  </div>
  // </div>


async function loadAndRenderNotes() {
  let notesWrapper = document.getElementById('notesWrapper');
  if (!notesWrapper) {
    notesWrapper = document.createElement('div');
    notesWrapper.id = 'notesWrapper';
    document.body.appendChild(notesWrapper);
  } else {
    notesWrapper.innerHTML = '';
  }

  let notes = [];
  try {
    notes = await mindWault_backend.getNotes();
  } catch (e) {
    console.error("Failed to load notes:", e);
  }

  notes.forEach(note => {
    const noteContainer = document.createElement('div');
    noteContainer.className = 'note-container';
    noteContainer.dataset.id = note.id;  // store noteId for later

    const noteTitle = document.createElement('input');
    noteTitle.type = 'text';
    noteTitle.value = note.title;
    noteTitle.readOnly = true;  // title is immutable in backend

    const noteContent = document.createElement('textarea');
    noteContent.value = note.text;
    noteContent.readOnly = true;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.id = 'buttons';

    // Edit button toggles editing note content (title readonly)
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = async () => {
  const isEditing = !noteContent.readOnly;

  if (isEditing) {
    // Save
    const updatedTitle = noteTitle.value.trim();
    const updatedContent = noteContent.value.trim();

    if (!updatedTitle) {
      alert("Title cannot be empty.");
      return;
    }

    try {
      await mindWault_backend.update(note.id, updatedContent, updatedTitle);
      noteTitle.readOnly = true;
      noteContent.readOnly = true;
      editButton.textContent = 'Edit';
      showToast("Note updated!");
    } catch (e) {
      console.error('Failed to update note:', e);
      alert("Update failed. Check console.");
    }
  } else {
    // Switch to edit mode
    noteTitle.readOnly = false;
    noteContent.readOnly = false;
    editButton.textContent = 'Save';
  }
};


    // Delete button deletes note by id
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = async () => {
      try {
        await mindWault_backend.delete(note.id);
        noteContainer.remove();
        showToast("Note deleted!");
      } catch (e) {
        console.error('Failed to delete note:', e);
      }
    };

    buttonsDiv.appendChild(editButton);
    buttonsDiv.appendChild(deleteButton);

    noteContainer.appendChild(noteTitle);
    noteContainer.appendChild(noteContent);
    noteContainer.appendChild(buttonsDiv);

    notesWrapper.appendChild(noteContainer);
  });

  // Add button to create new note
  const addNewNoteBtn = document.createElement('button');
  addNewNoteBtn.id = 'addNewNoteBtn';
  addNewNoteBtn.textContent = '+'; // Just a plus icon
  addNewNoteBtn.onclick = () => {
    createElement();  // your existing function to add a blank note input
  };
  notesWrapper.appendChild(addNewNoteBtn);
}

function createElement() {
  const notesWrapper = document.getElementById('notesWrapper');
  if (!notesWrapper) {
    console.error("No notesWrapper found");
    return;
  }

  // 🔒 Prevent creating another note if a draft (unsaved) already exists
  const hasUnsavedNote = [...notesWrapper.children].some(container => {
    return container.classList.contains('note-container') && !container.dataset.id;
  });

  if (hasUnsavedNote) {
    alert("Please save the current note before adding a new one.");
    return;
  }

  const noteContainer = document.createElement('div');
  noteContainer.className = 'note-container';

  const noteTitle = document.createElement('input');
  noteTitle.type = 'text';
  noteTitle.placeholder = 'Note Title';

  const noteContent = document.createElement('textarea');
  noteContent.placeholder = 'Write your note here...';

  const buttonsDiv = document.createElement('div');
  buttonsDiv.id = 'buttons';

  const saveButton = document.createElement('button');
  saveButton.className = 'saveButton';
  saveButton.textContent = 'Save Note';

  buttonsDiv.appendChild(saveButton);

  saveButton.onclick = async () => {
    const titleVal = noteTitle.value.trim();
    if (!titleVal) {
      alert("Please enter a note title.");
      return;
    }

    try {
      const newId = await mindWault_backend.create(titleVal, noteContent.value);
      showToast("Note saved!");

      noteTitle.readOnly = true;
      noteContent.readOnly = true;
      noteContainer.dataset.id = newId;

      // Switch Save to Edit
      saveButton.textContent = 'Edit';
      saveButton.onclick = async () => {
        const isEditing = !noteContent.readOnly;

        if (isEditing) {
          // Save changes
          const updatedTitle = noteTitle.value.trim();
          const updatedContent = noteContent.value.trim();

          if (!updatedTitle) {
            alert("Title cannot be empty.");
            return;
          }

          try {
            await mindWault_backend.update(newId, updatedContent, updatedTitle);
            noteTitle.readOnly = true;
            noteContent.readOnly = true;
            saveButton.textContent = 'Edit';
            alert('Note updated');
          } catch (e) {
            console.error('Failed to update note:', e);
            alert("Update failed. See console.");
          }
        } else {
          // Enable editing
          noteTitle.readOnly = false;
          noteContent.readOnly = false;
          noteTitle.focus();
          saveButton.textContent = 'Save';
        }
      };

      // ✅ Create Delete button after saving
      const deleteButton = document.createElement('button');
      deleteButton.className = 'deleteButton';
      deleteButton.textContent = 'Delete';
      deleteButton.onclick = async () => {
        try {
          await mindWault_backend.delete(newId);
          noteContainer.remove();
          showToast("Note deleted!");
        } catch (e) {
          console.error('Failed to delete note:', e);
        }
      };

      buttonsDiv.appendChild(deleteButton);

    } catch (e) {
      console.error('Failed to save note:', e);
      alert('Failed to save note. See console.');
    }
  };

  noteContainer.appendChild(noteTitle);
  noteContainer.appendChild(noteContent);
  noteContainer.appendChild(buttonsDiv);
  notesWrapper.appendChild(noteContainer);
}

window.addEventListener("DOMContentLoaded", () => {
  const darkModeButton = document.getElementById("darkModeImg");
  const logoLight = document.getElementById("logo-light");
  const logoDark = document.getElementById("logo-dark");

  // Load mode from localStorage or default to false (light mode)
  let isDarkMode = localStorage.getItem("dark-mode") === "true";

  // Function to apply dark/light mode styles and logos
  function applyDarkMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    localStorage.setItem("dark-mode", isDark);

    if (isDark) {
      logoLight.style.display = "none";
      logoDark.style.display = "block";
    } else {
      logoLight.style.display = "block";
      logoDark.style.display = "none";
    }
  }

  // Apply initial mode
  applyDarkMode(isDarkMode);

  // Toggle on button click
  darkModeButton.addEventListener("click", () => {
    isDarkMode = !isDarkMode;
    applyDarkMode(isDarkMode);
  });
});

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
