import { AuthClient } from "@dfinity/auth-client";
import { createActor, canisterId } from "../../declarations/mindWault_backend";
import { HttpAgent } from "@dfinity/agent";
import {
  showToast,
  enableNotesSearch,
  applyDarkMode,
  exportNotesAsText,
  toggleSearchBarVisibility
} from "./features.js";

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
let principalId;

window.addEventListener("DOMContentLoaded", async () => {
  const welcomeMessage = document.getElementById("welcome-message");
  const loginBtn = document.getElementById("login");
  const loginGoogleBtn = document.getElementById("login-google");
  const loginII20Btn = document.getElementById("login-ii-20");
  const burgerMenu = document.getElementById("burger-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const darkModeToggle = document.getElementById("dropdown-darkmode-toggle");
  const exportNotesBtn = document.getElementById("dropdown-export-notes");
  const dropdownLogout = document.getElementById("dropdown-logout");
  const loginScreen = document.getElementById("login-screen");
  const navbar = document.getElementById("navbar");

  welcomeMessage.textContent =
    phrases[Math.floor(Math.random() * phrases.length)];

  authClient = await AuthClient.create();
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    const identity = await authClient.getIdentity();
    principalId = identity.getPrincipal().toText();
    const agent = new HttpAgent({ identity });
    actor = createActor(canisterId, { agent });

    loginScreen?.classList.add("hidden");
    navbar?.classList.remove("hidden");
    burgerMenu?.classList.remove("hidden");

    await loadAndRenderNotes();
  }

  const canonicalOrigin = "https://aucs2-4yaaa-aaaab-abqba-cai.icp0.io";
  async function handleLogin(identityProvider) {
    authClient.login({
      identityProvider,
      derivationOrigin: canonicalOrigin,
      maxTimeToLive: BigInt(7n * 24n * 60n * 60n * 1_000_000_000n),
      onSuccess: async () => {
        const identity = await authClient.getIdentity();
        principalId = identity.getPrincipal().toText();
        const agent = new HttpAgent({ identity });
        actor = createActor(canisterId, { agent });

        loginScreen?.classList.add("hidden");
        navbar?.classList.remove("hidden");
        burgerMenu?.classList.remove("hidden");

        await loadAndRenderNotes();
      }
    });
  }

  loginBtn?.addEventListener("click", () =>
    handleLogin("https://identity.ic0.app")
  );
  loginGoogleBtn?.addEventListener("click", () =>
    handleLogin("https://nfid.one/authenticate")
  );
  loginII20Btn?.addEventListener("click", () =>
    handleLogin("https://id.ai/")
  );

  dropdownLogout?.addEventListener("click", async () => {
    await authClient.logout();
    location.reload();
  });

  let isDarkMode = localStorage.getItem("dark-mode") === "true";
  applyDarkMode(isDarkMode);
  darkModeToggle?.addEventListener("click", () => {
    isDarkMode = !isDarkMode;
    applyDarkMode(isDarkMode);
  });

  exportNotesBtn?.addEventListener("click", () => {
    exportNotesAsText("notesWrapper");
    showToast("Notes exported!");
  });

  burgerMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", () =>
    dropdownMenu?.classList.add("hidden")
  );

  /* ---------------- NOTES ---------------- */
  async function loadAndRenderNotes() {
    let notesWrapper = document.getElementById("notesWrapper");
    if (!notesWrapper) {
      notesWrapper = document.createElement("div");
      notesWrapper.id = "notesWrapper";
      document.body.appendChild(notesWrapper);
    } else notesWrapper.innerHTML = "";

    const notes = await actor.getNotes();
    
    // Initialize search
    enableNotesSearch("notesWrapper", "notes-search");

    notes.forEach((note) =>
      createNoteElement(note.id, note.title, note.text, notesWrapper)
    );

    toggleSearchBarVisibility();

    const addNewNoteBtn = document.createElement("button");
    addNewNoteBtn.id = "addNewNoteBtn";
    addNewNoteBtn.textContent = "+";
    addNewNoteBtn.onclick = () => createNewNote(notesWrapper);
    notesWrapper.appendChild(addNewNoteBtn);
  }

 function setupAutoSave(noteContainer, noteTitle, noteContent) {
  let timeout;
  let lastSaved = {
    title: noteTitle.value,
    content: noteContent.value
  };

  const showSavedStatus = () => {
    let status = noteContainer.querySelector(".note-status");

    if (!status) {
      status = document.createElement("span");
      status.className = "note-status";
      status.textContent = "Saved";
      noteContainer.appendChild(status);
    }

    // reset in case user types again
    status.classList.remove("fade-out");

    setTimeout(() => {
      status.classList.add("fade-out");
      setTimeout(() => status.remove(), 500); // remove after fade
    }, 1500); // visible for 1.5s
  };

  const save = async () => {
    const title = noteTitle.value.trim();
    if (!title) return; // silently ignore empty title

    try {
      await actor.update(
        BigInt(noteContainer.dataset.id),
        noteContent.value,
        title
      );
      lastSaved = { title, content: noteContent.value };
      showSavedStatus(); // show saved text
    } catch {
      showToast("Save failed");
    }
  };

  const schedule = () => {
    clearTimeout(timeout);
    timeout = setTimeout(save, 1800);
  };

  noteTitle.addEventListener("input", schedule);
  noteContent.addEventListener("input", schedule);
}


  function createNoteElement(id, title, text, container) {
    const noteContainer = document.createElement("div");
    noteContainer.className = "note-container";
    noteContainer.dataset.id = id;

    const noteTitle = document.createElement("input");
    noteTitle.type = "text";
    noteTitle.value = title;
    noteTitle.className = "note-title"; // keep your styling

    const noteContent = document.createElement("textarea");
    noteContent.value = text;

    const buttons = document.createElement("div");
    buttons.className = "buttons";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
      if (!confirm("Delete this note?")) return;
      await actor.delete(BigInt(id));
      noteContainer.remove();
      toggleSearchBarVisibility();
      showToast("Note deleted");
    };

    buttons.append(deleteBtn);

    noteContainer.append(noteTitle, noteContent, buttons);
    container.appendChild(noteContainer);

    setupAutoSave(noteContainer, noteTitle, noteContent);
  }

  function createNewNote(notesWrapper) {
    const noteContainer = document.createElement("div");
    noteContainer.className = "note-container";

    const noteTitle = document.createElement("input");
    noteTitle.type = "text";
    noteTitle.placeholder = "Note Title";
    noteTitle.className = "note-title"; // keep styling

    const noteContent = document.createElement("textarea");
    noteContent.placeholder = "Write your note here...";

    const buttons = document.createElement("div");
    buttons.className = "buttons";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Discard";
    deleteBtn.onclick = () => noteContainer.remove();

    buttons.append(deleteBtn);
    noteContainer.append(noteTitle, noteContent, buttons);
    notesWrapper.prepend(noteContainer);

    let timeout;
    let created = false;
    let noteId;

    const autoCreateAndSave = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const title = noteTitle.value.trim();
        if (!title) return;

        try {
          if (!created) {
            noteId = await actor.create(title, noteContent.value);
            noteContainer.dataset.id = noteId;
            created = true;
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = async () => {
              if (!confirm("Delete this note?")) return;
              await actor.delete(BigInt(noteId));
              noteContainer.remove();
              toggleSearchBarVisibility();
            };
            setupAutoSave(noteContainer, noteTitle, noteContent);
          } else {
            await actor.update(
              noteContainer.dataset.id,
              noteContent.value,
              title
            );
          }
        } catch {
          showToast("Save failed");
        }
      }, 650);
    };

    noteTitle.addEventListener("input", autoCreateAndSave);
    noteContent.addEventListener("input", autoCreateAndSave);
  }
});
