import { AuthClient } from "@dfinity/auth-client";
import { createActor, canisterId, mindWault_backend } from "../../declarations/mindWault_backend";
import { HttpAgent, Actor } from "@dfinity/agent";
import {showToast} from "./features.js";

const phrases = [
      `"Your thoughts belong here. Start capturing what matters."`,
      `"Turn ideas into action — one note at a time."`,
      `"Where your thoughts take shape."`,
      `"Notes that remember what you shouldn't have to."`,
      `"Organize the chaos. Start noting."`,
      `"Your second brain starts here."`
    ];

  const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  document.getElementById("welcome-message").textContent = randomPhrase;

let authClient;
let actor;

// Function to log in using Internet Identity
async function login() {
  authClient = await AuthClient.create();
  authClient.login({
    identityProvider: `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:4943/`,  // "https://identity.ic0.app",
    onSuccess: async () => {
      const identity = await authClient.getIdentity();
      const agent = new HttpAgent({identity});
      actor = createActor(canisterId, { agent });
      document.getElementById("login").style.display = "none";
      document.getElementById("logout").style.display = "inline";
      document.getElementById("welcome-message").style.display = "none";
      await loadAndRenderNotes();
    },
    onError: (err) => {
      console.error("Login failed:", err);
    },
  });
}

async function logout() {
    await authClient.logout();
    document.getElementById("login").style.display = "inline";
    document.getElementById("logout").style.display = "none";
    document.getElementById("welcome-message").textContent = randomPhrase;
    document.getElementById("welcome-message").style.display = "inline-block";


      // Clear and remove notes wrapper if exists
    const notesWrapper = document.getElementById("notesWrapper");
    if (notesWrapper) {
      notesWrapper.innerHTML = ""; 
      notesWrapper.remove();
    }
}

document.getElementById("login").addEventListener("click", login);
document.getElementById("logout").addEventListener("click", logout);


async function loadAndRenderNotes() {
  let notesWrapper = document.getElementById('notesWrapper');
  if (!notesWrapper) {
    notesWrapper = document.createElement('div');
    notesWrapper.id = 'notesWrapper';
    document.body.appendChild(notesWrapper);
  } else {
    notesWrapper.innerHTML = '';
  }
  //addSearchBar();

  let notes = [];
  try {
    notes = await actor.getNotes();
  } catch (error) {
    console.error("Failed to load notes:", error);
  }

  notes.forEach(note => {
    const noteContainer = document.createElement('div');
    noteContainer.className = 'note-container';
    noteContainer.dataset.id = note.id;  // store noteId for later

    const noteTitle = document.createElement('input');
    noteTitle.type = 'text';
    noteTitle.value = note.title;
    noteTitle.readOnly = true; 

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
      await actor.update(note.id, updatedContent, updatedTitle);
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
        await actor.delete(note.id);
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
  addNewNoteBtn.textContent = '+';
  addNewNoteBtn.onclick = () => {
    createElement();  
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
      const newId = await actor.create(titleVal, noteContent.value);
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
            await actor.update(newId, updatedContent, updatedTitle);
            noteTitle.readOnly = true;
            noteContent.readOnly = true;
            saveButton.textContent = 'Edit';
            showToast("Note updated!");
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
          await actor.delete(newId);
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

window.addEventListener("DOMContentLoaded", async () => {
  const darkModeButton = document.getElementById("darkModeImg");
  const logoLight = document.getElementById("logo-light");
  const logoDark = document.getElementById("logo-dark");

  authClient = await AuthClient.create();
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    const identity = await authClient.getIdentity();
    const agent = new HttpAgent({ identity });
    actor = createActor(canisterId, { agent });

    document.getElementById("login").style.display = "none";
    document.getElementById("logout").style.display = "inline";
    document.getElementById("welcome-message").style.display = "none";

    await loadAndRenderNotes();
  } else {
    document.getElementById("login").style.display = "inline";
    document.getElementById("logout").style.display = "none";
  }

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



// function addSearchBar() {
//   let searchWrapper = document.getElementById("searchWrapper");
//   if (!searchWrapper) {
//     searchWrapper = document.createElement("div");
//     searchWrapper.id = "searchWrapper";

//     const searchInput = document.createElement("input");
//     searchInput.type = "text";
//     searchInput.id = "noteSearch";
//     searchInput.placeholder = "Search notes...";
//     searchInput.style.marginBottom = "12px";
//     searchInput.style.padding = "8px";

//     searchInput.addEventListener("input", () => {
//       const query = searchInput.value.toLowerCase();
//       filterNotes(query);
//     });

//     searchWrapper.appendChild(searchInput);
//     document.body.insertBefore(searchWrapper, document.getElementById("notesWrapper"));
//   }
// }

// function filterNotes(query) {
//   const noteContainers = document.querySelectorAll(".note-container");

//   noteContainers.forEach(container => {
//     const title = container.querySelector("input[type='text']").value.toLowerCase();
//     const content = container.querySelector("textarea").value.toLowerCase();

//     const matches = title.includes(query) || content.includes(query);
//     container.style.display = matches ? "block" : "none";
//   });
// }

 // Dropdown toggle
    const menu = document.getElementById('menu');
    const dropdown = document.getElementById('dropdown-menu');
    const darkModeToggle = document.getElementById('dropdown-darkmode-toggle');
    const logoutBtn = document.getElementById('dropdown-logout');

    menu.addEventListener('click', () => {
      dropdown.classList.toggle('hidden');
    });

    darkModeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      dropdown.classList.add('hidden');
    });

    logoutBtn.addEventListener('click', () => {
      alert('Logged out!');
      dropdown.classList.add('hidden');
      // Add your logout logic here
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
