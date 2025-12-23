import { AuthClient } from "@dfinity/auth-client";
import { createActor, canisterId } from "../../declarations/mindWault_backend";
import { HttpAgent, Actor } from "@dfinity/agent";
import {
  showToast,
  enableNotesSearch,
  applyDarkMode,
  exportNotesAsText,
  toggleSearchBarVisibility,
  createPremiumModal
} from "./features.js";

// ICP ledger canister info
const ICP_LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// Minimal Candid for `account_balance` [[Ledger balance](https://internetcomputer.org/docs/references/ledger#_balance)]
const ledgerIdlFactory = ({ IDL }) => {
  const Tokens = IDL.Record({ e8s: IDL.Nat64 });
  const AccountBalanceArgs = IDL.Record({ account: IDL.Vec(IDL.Nat8) });
  return IDL.Service({
    account_balance: IDL.Func([AccountBalanceArgs], [Tokens], ["query"]),
  });
};

const phrases = [
  "Your thoughts belong here. Start capturing what matters.",
  "Turn ideas into action — one note at a time.",
  "Where ideas take shape.",
  "Notes that remember what you shouldn't have to.",
  "Organize the chaos. Start noting.",
  "Your second brain starts here."
];

let authClient;
let actor;
let principalId;
let identity; // keep identity globally so we can reuse it
let ledgerActor; // reuse ledger actor
let currentDepositAccountBlob = null; // Uint8Array
let currentDepositAccountHex = null;

const myWalletAccountId = "853bd374992baa60b4b5deadba7d3bb607e0e9bfc77e1fca91a94747de926c94";

window.addEventListener("DOMContentLoaded", async () => {
  const welcomeMessage = document.getElementById("welcome-message");
  const loginBtn = document.getElementById("login");
  const loginGoogleBtn = document.getElementById("login-google");
  const loginII20Btn = document.getElementById("login-ii-20");
  const burgerMenu = document.getElementById("burger-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const premiumBtn = document.getElementById("dropdown-premium");
  const darkModeToggle = document.getElementById("dropdown-darkmode-toggle");
  const exportNotesBtn = document.getElementById("dropdown-export-notes");
  const dropdownLogout = document.getElementById("dropdown-logout");
  const loginScreen = document.getElementById("login-screen");
  const navbar = document.getElementById("navbar");


  const premiumModal = createPremiumModal();

  const premiumAddressInput = document.getElementById("premium-address-input");
  const premiumBalanceText = document.getElementById("premium-balance-text");
  const premiumBalanceRefresh = document.getElementById("premium-balance-refresh");
  const premiumModalClose = document.getElementById("premium-modal-close");
  const premiumModalPay = document.getElementById("premium-modal-pay");

  premiumModalPay.addEventListener("click", async () => {
    const result = await actor.sendHalfIcpToMyWallet();
    if ("ok" in result) {
    // transfer succeeded, mark UI as premium
      await actor.addPremium();
      await updatePremiumUI();
      showToast("Payment received, you are now premium!");
      premiumModal.remove();
    } else {
        alert(`Payment failed: ${result.err}`);
      }
  });

  premiumModalClose.addEventListener("click", () => {
    premiumModal.style.display = "none";
  });

premiumAddressInput.addEventListener("click", () => {
  premiumAddressInput.select();
});

  premiumBalanceRefresh.addEventListener("click", async () => {
    if (!currentDepositAccountBlob || !identity) return;
    await updatePremiumBalanceUI(currentDepositAccountBlob);
  });

  welcomeMessage.textContent = phrases[Math.floor(Math.random() * phrases.length)];

  authClient = await AuthClient.create({
    idleOptions: {
      idleTimeout: 1000 * 60 * 10,
      disableDefaultIdleCallback: true,
    },
  });
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    identity = await authClient.getIdentity();
    principalId = identity.getPrincipal().toText();
    const agent = new HttpAgent({ identity });
    actor = createActor(canisterId, { agent });

    loginScreen?.classList.add("hidden");
    navbar?.classList.remove("hidden");
    burgerMenu?.classList.remove("hidden");
    currentDepositAccountBlob = await actor.getDepositAccount(); // Uint8Array
        currentDepositAccountHex = Array.from(currentDepositAccountBlob)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        console.log("Your ICP deposit address:", currentDepositAccountHex);
   await Promise.all([updatePremiumUI(), loadAndRenderNotes()]);
  }

  const canonicalOrigin = "https://aucs2-4yaaa-aaaab-abqba-cai.icp0.io";

  async function handleLogin(identityProvider) {
    authClient.login({
      identityProvider,
      derivationOrigin: canonicalOrigin,
      maxTimeToLive: BigInt(7n * 24n * 60n * 60n * 1_000_000_000n),
      onSuccess: async () => {
        identity = await authClient.getIdentity();
        principalId = identity.getPrincipal().toText();
        const agent = new HttpAgent({ identity });
        actor = createActor(canisterId, { agent });

        loginScreen?.classList.add("hidden");
        navbar?.classList.remove("hidden");
        burgerMenu?.classList.remove("hidden");
        Promise.all([await loadAndRenderNotes(), await updatePremiumUI()]);

        currentDepositAccountBlob = await actor.getDepositAccount(); // Uint8Array
        currentDepositAccountHex = Array.from(currentDepositAccountBlob)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        console.log("Your ICP deposit address:", currentDepositAccountHex);
      }
    });
  }

  // Create / reuse ledger actor
  async function getLedgerActor() {
    if (ledgerActor) return ledgerActor;
    if (!identity) return null;

    const ledgerAgent = new HttpAgent({ identity });
    ledgerActor = Actor.createActor(ledgerIdlFactory, {
      agent: ledgerAgent,
      canisterId: ICP_LEDGER_CANISTER_ID,
    });
    return ledgerActor;
  }

  // Fetch balance for given account blob and update modal UI
  async function updatePremiumBalanceUI(accountBlob) {
    try {
      premiumBalanceText.textContent = "Loading...";
      const ledger = await getLedgerActor();
      if (!ledger) {
        premiumBalanceText.textContent = "Error";
        return;
      }

      const res = await ledger.account_balance({
        account: Array.from(accountBlob),
      });

      const icp = Number(res.e8s) / 100_000_000;
      premiumBalanceText.textContent = `${icp} ICP`;
    } catch (e) {
      console.error("Failed to fetch ICP balance:", e);
      premiumBalanceText.textContent = "Error";
    }
  }

  loginBtn?.addEventListener("click", () => handleLogin("https://identity.ic0.app"));
  loginGoogleBtn?.addEventListener("click", () => handleLogin("https://nfid.one/authenticate"));
  loginII20Btn?.addEventListener("click", () => handleLogin("https://id.ai/"));

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

  premiumBtn?.addEventListener("click", async () => {
    if (!identity || !actor) {
      showToast("Please log in first.");
      return;
    }

    try {
        currentDepositAccountBlob = await actor.getDepositAccount();
        currentDepositAccountHex = Array.from(currentDepositAccountBlob)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
          const input = document.getElementById("premium-address-input");
          if (input) {
            input.value = currentDepositAccountHex;
          }
          
          await updatePremiumBalanceUI(currentDepositAccountBlob);
          premiumModal.style.display = "flex";
      }

    
    catch (e) {
      console.error("Error preparing premium payment info:", e);
      showToast("Could not load premium payment info.");
    }
  });

  async function updatePremiumUI() {
    if (!actor || !premiumBtn) return;
    const isPremium = await actor.isPremium();
    if (isPremium) {
      premiumBtn.disabled = true;
      premiumBtn.textContent = "💎 Premium User";
    } else {
      premiumBtn.disabled = false;
      premiumBtn.textContent = "💎 Buy Premium";
    }
  }

  exportNotesBtn?.addEventListener("click", () => {
    exportNotesAsText("notesWrapper");
    showToast("Notes exported!");
  });

  burgerMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", () => dropdownMenu?.classList.add("hidden"));

  /* ---------------- NOTES ---------------- */

  async function loadAndRenderNotes() {
    let notesWrapper = document.getElementById("notesWrapper");
    if (!notesWrapper) {
      notesWrapper = document.createElement("div");
      notesWrapper.id = "notesWrapper";
      document.body.appendChild(notesWrapper);
    } else notesWrapper.innerHTML = "";

    const notes = await actor.getNotes(); // all notes with pinned property
    const pinnedNotes = notes.filter(n => n.pinned);
    const unpinnedNotes = notes.filter(n => !n.pinned);

    enableNotesSearch("notesWrapper", "notes-search");

    pinnedNotes.forEach(note => createNoteElement(note.id, note.title, note.text, notesWrapper, true));
    unpinnedNotes.forEach(note => createNoteElement(note.id, note.title, note.text, notesWrapper, false));

    toggleSearchBarVisibility();

    const addNewNoteBtn = document.createElement("button");
    addNewNoteBtn.id = "addNewNoteBtn";
    addNewNoteBtn.textContent = "+";
    addNewNoteBtn.onclick = () => createNewNote(notesWrapper);
    notesWrapper.appendChild(addNewNoteBtn);
  }

  function setupAutoSave(noteContainer, noteTitle, noteContent) {
    let timeout;

    const showSavedStatus = () => {
      let status = noteContainer.querySelector(".note-status");
      if (!status) {
        status = document.createElement("span");
        status.className = "note-status";
        status.textContent = "Saved";
        noteContainer.appendChild(status);
      }
      status.classList.remove("fade-out");
      setTimeout(() => {
        status.classList.add("fade-out");
        setTimeout(() => status.remove(), 500);
      }, 1500);
    };

    const save = async () => {
      const title = noteTitle.value.trim();
      if (!title) return;
      try {
        await actor.update(BigInt(noteContainer.dataset.id), noteContent.value, title);
        showSavedStatus();
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

  function createNoteElement(id, title, text, container, pinned) {
    const noteContainer = document.createElement("div");
    noteContainer.className = "note-container";
    noteContainer.dataset.id = id;

    const noteTitle = document.createElement("input");
    noteTitle.type = "text";
    noteTitle.value = title;
    noteTitle.className = "note-title";

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

    const pinBtn = document.createElement("span");
    pinBtn.className = "pin-btn";
    pinBtn.textContent =  "📌";
    pinBtn.classList.toggle("pinned", pinned);

    pinBtn.onclick = async () => {
      try {
        await actor.setPinned(BigInt(id), !pinned);
        pinned = !pinned;
        pinBtn.classList.toggle("pinned", pinned);

        const notesWrapper = noteContainer.parentElement;
        if (pinned) {
          notesWrapper.prepend(noteContainer);
        } else {
          const allNotes = Array.from(notesWrapper.querySelectorAll(".note-container"));
          let insertAfter = allNotes.find(
            n => n !== noteContainer && !n.querySelector(".pin-btn").classList.contains("pinned")
          );
          if (insertAfter) {
            insertAfter.after(noteContainer);
          } else {
            notesWrapper.appendChild(noteContainer);
          }
        }
      } catch {
        showToast("Failed to pin note");
      }
    };

    buttons.append(deleteBtn);

    noteContainer.append(noteTitle, noteContent, buttons, pinBtn);
    container.appendChild(noteContainer);

    setupAutoSave(noteContainer, noteTitle, noteContent);
  }

  function createNewNote(notesWrapper) {
    const showSavedStatus = () => {
      let status = noteContainer.querySelector(".note-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "note-status";
    status.textContent = "Saved";
    noteContainer.appendChild(status);
  }
  status.classList.remove("fade-out");
  setTimeout(() => {
    status.classList.add("fade-out");
    setTimeout(() => status.remove(), 500);
  }, 1500);
};
    const noteContainer = document.createElement("div");
    noteContainer.className = "note-container";

    const noteTitle = document.createElement("input");
    noteTitle.type = "text";
    noteTitle.placeholder = "Note Title";
    noteTitle.className = "note-title";

    const noteContent = document.createElement("textarea");
    noteContent.placeholder = "Write your note here...";

    const buttons = document.createElement("div");
    buttons.className = "buttons";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Discard";
    deleteBtn.onclick = () => noteContainer.remove();

    const pinBtn = document.createElement("span");
    pinBtn.className = "pin-btn";
    pinBtn.textContent = "📌";
    let pinned = false;

    pinBtn.onclick = async () => {
      if (!noteContainer.dataset.id) return;
      try {
        await actor.setPinned(BigInt(noteContainer.dataset.id), !pinned);
        pinned = !pinned;
      } catch {
        showToast("Failed to pin note");
      }
    };

    buttons.append(deleteBtn);
    noteContainer.append(noteTitle, noteContent, buttons, pinBtn);
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
            showSavedStatus();
            toggleSearchBarVisibility();
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = async () => {
              if (!confirm("Delete this note?")) return;
              await actor.delete(BigInt(noteId));
              noteContainer.remove();
              toggleSearchBarVisibility();
            };
          } else {
            await actor.update(BigInt(noteContainer.dataset.id), noteContent.value, title);
            showSavedStatus();
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