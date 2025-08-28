import { AuthClient } from "@dfinity/auth-client";
import { createActor, canisterId } from "../../declarations/mindWault_backend";
import { HttpAgent } from "@dfinity/agent";
import { showToast, enableNotesSearch } from "./features.js";

const phrases = [
  "Your thoughts belong here. Start capturing what matters.",
  "Turn ideas into action — one note at a time.",
  "Where your thoughts take shape.",
  "Notes that remember what you shouldn't have to.",
  "Organize the chaos. Start noting.",
  "Your second brain starts here."
];

let authClient;
let actor;

window.addEventListener("DOMContentLoaded", async () => {
  // ----------------- INITIAL SETUP -----------------
  const welcomeMessage = document.getElementById("welcome-message");
  const loginBtn = document.getElementById("login");
  const burgerMenu = document.getElementById("burger-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const darkModeToggle = document.getElementById("dropdown-darkmode-toggle");
  const dropdownLogout = document.getElementById("dropdown-logout");
  const darkModeButton = document.getElementById("darkModeImg");

  welcomeMessage.textContent = phrases[Math.floor(Math.random() * phrases.length)];

  authClient = await AuthClient.create();
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    const identity = await authClient.getIdentity();
    const agent = new HttpAgent({ identity });
    actor = createActor(canisterId, { agent });

    loginBtn.style.display = "none";
    burgerMenu?.classList.remove("hidden");
    welcomeMessage.style.display = "none";

    await loadAndRenderNotes();
  } else {
    loginBtn.style.display = "inline";
    burgerMenu?.classList.add("hidden");
  }

  // ----------------- LOGIN / LOGOUT -----------------
  loginBtn?.addEventListener("click", login);
  dropdownLogout?.addEventListener("click", async () => {
    await logout();
    dropdownMenu?.classList.add("hidden");
  });

  // ----------------- DARK MODE -----------------
let isDarkMode = localStorage.getItem("dark-mode") === "true";

function applyDarkMode(dark) {
  document.body.classList.toggle("dark-mode", dark);
  document.body.classList.toggle("light-mode", !dark);
  localStorage.setItem("dark-mode", dark);
}

// Apply immediately on load
applyDarkMode(isDarkMode);

darkModeButton?.addEventListener("click", () => {
  isDarkMode = !isDarkMode;
  applyDarkMode(isDarkMode);
});

darkModeToggle?.addEventListener("click", () => {
  isDarkMode = !isDarkMode;
  applyDarkMode(isDarkMode);
  dropdownMenu?.classList.add("hidden");
});


  // ----------------- BURGER MENU -----------------
  burgerMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!dropdownMenu?.contains(e.target) && !burgerMenu?.contains(e.target)) {
      dropdownMenu?.classList.add("hidden");
    }
  });

  // ----------------- NOTES -----------------
  async function loadAndRenderNotes() {
    let notesWrapper = document.getElementById('notesWrapper');
    if (!notesWrapper) {
      notesWrapper = document.createElement('div');
      notesWrapper.id = 'notesWrapper';
      document.body.appendChild(notesWrapper);
    } else notesWrapper.innerHTML = '';

    let loading = document.createElement('div');
    loading.id = 'loading';
    loading.className = 'loading';
    loading.textContent = 'Loading notes...';
    notesWrapper.appendChild(loading);


    let notes = [];
    try {
      notes = await actor.getNotes();
    } catch (error) {
      console.error("Failed to load notes:", error);
    }

    loading.remove();

      // ---------- Create search bar ABOVE notesWrapper ----------
  let searchBar = document.getElementById('notes-search');
  if (!searchBar) {
    searchBar = document.createElement('input');
    searchBar.type = 'text';
    searchBar.placeholder = 'Search notes...';
    searchBar.id = 'notes-search';
    searchBar.style.width = '50%';
    searchBar.style.padding = '10px';
    searchBar.style.margin = '10px auto';
    searchBar.style.display = 'block';
    document.body.insertBefore(searchBar, notesWrapper);
  }
  enableNotesSearch('notesWrapper', 'notes-search');

    notes.forEach(note => createNoteElement(note.id, note.title, note.text, notesWrapper));

    const addNewNoteBtn = document.createElement('button');
    addNewNoteBtn.id = 'addNewNoteBtn';
    addNewNoteBtn.textContent = '+';
    addNewNoteBtn.onclick = () => createElement(notesWrapper);
    notesWrapper.appendChild(addNewNoteBtn);
  }

  function createNoteElement(id, title, text, container) {
    const noteContainer = document.createElement('div');
    noteContainer.className = 'note-container';
    noteContainer.dataset.id = id;

    const noteTitle = document.createElement('input');
    noteTitle.type = 'text';
    noteTitle.value = title;
    noteTitle.readOnly = true;

    const noteContent = document.createElement('textarea');
    noteContent.value = text;
    noteContent.readOnly = true;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = async () => {
      const isEditing = !noteContent.readOnly;
      if (isEditing) {
        const updatedTitle = noteTitle.value.trim();
        const updatedContent = noteContent.value.trim();
        if (!updatedTitle) return alert("Title cannot be empty.");
        try {
          await actor.update(id, updatedContent, updatedTitle);
          noteTitle.readOnly = true;
          noteContent.readOnly = true;
          editButton.textContent = 'Edit';
          showToast("Note updated!");
        } catch (e) {
          console.error(e);
          alert("Update failed. See console.");
        }
      } else {
        noteTitle.readOnly = false;
        noteContent.readOnly = false;
        noteTitle.focus();
        editButton.textContent = 'Save';
      }
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = async () => {
      try {
        await actor.delete(id);
        noteContainer.remove();
        showToast("Note deleted!");
      } catch (e) {
        console.error(e);
      }
    };

    buttonsDiv.append(editButton, deleteButton);
    noteContainer.append(noteTitle, noteContent, buttonsDiv);
    container.appendChild(noteContainer);
  }

  function createElement(notesWrapper) {
    const hasUnsavedNote = [...notesWrapper.children].some(c => c.classList.contains('note-container') && !c.dataset.id);
    if (hasUnsavedNote) return alert("Please save the current note before adding a new one.");

    const noteContainer = document.createElement('div');
    noteContainer.className = 'note-container';

    const noteTitle = document.createElement('input');
    noteTitle.type = 'text';
    noteTitle.placeholder = 'Note Title';

    const noteContent = document.createElement('textarea');
    noteContent.placeholder = 'Write your note here...';

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Note';
    saveButton.onclick = async () => {
      const titleVal = noteTitle.value.trim();
      if (!titleVal) return alert("Please enter a note title.");

      try {
        const newId = await actor.create(titleVal, noteContent.value);
        showToast("Note saved!");
        noteTitle.readOnly = true;
        noteContent.readOnly = true;
        noteContainer.dataset.id = newId;
        saveButton.textContent = 'Edit';
        saveButton.onclick = async () => {
          const isEditing = !noteContent.readOnly;
          if (isEditing) {
            const updatedTitle = noteTitle.value.trim();
            const updatedContent = noteContent.value.trim();
            if (!updatedTitle) return alert("Title cannot be empty.");
            try {
              await actor.update(newId, updatedContent, updatedTitle);
              noteTitle.readOnly = true;
              noteContent.readOnly = true;
              saveButton.textContent = 'Edit';
              showToast("Note updated!");
            } catch (e) { console.error(e); alert("Update failed."); }
          } else {
            noteTitle.readOnly = false;
            noteContent.readOnly = false;
            noteTitle.focus();
            saveButton.textContent = 'Save';
          }
        };

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = async () => {
          try {
            await actor.delete(newId);
            noteContainer.remove();
            showToast("Note deleted!");
          } catch (e) { console.error(e); }
        };
        buttonsDiv.appendChild(deleteButton);
      } catch (e) { console.error(e); alert("Failed to save note."); }
    };

    buttonsDiv.appendChild(saveButton);
    noteContainer.append(noteTitle, noteContent, buttonsDiv);
    notesWrapper.prepend(noteContainer);
  }

  async function login() {
    authClient = await AuthClient.create();
    authClient.login({
      identityProvider: "https://identity.ic0.app", // `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:4943/`, 
      onSuccess: async () => {
        const identity = await authClient.getIdentity();
        const agent = new HttpAgent({ identity });
        actor = createActor(canisterId, { agent });

        loginBtn.style.display = "none";
        burgerMenu?.classList.remove("hidden");
        welcomeMessage.style.display = "none";

        await loadAndRenderNotes();
      },
      onError: (err) => console.error("Login failed:", err)
    });
  }

  async function logout() {
    if (!authClient) return;
    await authClient.logout();

    loginBtn.style.display = "inline";
    welcomeMessage.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    welcomeMessage.style.display = "inline-block";

    const notesWrapper = document.getElementById("notesWrapper");
    if (notesWrapper) notesWrapper.remove();
    document.getElementById("notes-search").remove();
    burgerMenu?.classList.add("hidden");
  }
});
