//------------------ TOAST NOTIFICATIONS -----------------
export function showToast(message) {
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

//------------------ NOTES SEARCH -----------------
export function enableNotesSearch(notesWrapperId, searchInputId) {
  const notesWrapper = document.getElementById(notesWrapperId);
  const searchInput = document.getElementById(searchInputId);
  if (!notesWrapper || !searchInput) return;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    const noteContainers = notesWrapper.querySelectorAll('.note-container');

    noteContainers.forEach(note => {
      const title = note.querySelector('input[type="text"]').value.toLowerCase();
      const content = note.querySelector('textarea').value.toLowerCase();
      note.style.display = title.includes(query) || content.includes(query) ? 'flex' : 'none';
    });
  });
}

//------------------ DARK MODE -----------------
export function applyDarkMode(dark) {
  document.body.classList.toggle("dark-mode", dark);
  document.body.classList.toggle("light-mode", !dark);
  localStorage.setItem("dark-mode", dark);
}

//------------------ EXPORT NOTES AS TEXT -----------------
export function exportNotesAsText(notesWrapperId) {
  const notesWrapper = document.getElementById(notesWrapperId);
  if (!notesWrapper) return alert("No notes to export.");

  const notes = [...notesWrapper.querySelectorAll(".note-container")].map(note => {
    const title = note.querySelector("input")?.value || "";
    const content = note.querySelector("textarea")?.value || "";
    return `Title: ${title}\n${content}\n\n`;
  });

  if (notes.length === 0) return alert("No notes to export.");

  const blob = new Blob([notes.join("")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mindvault_notes.txt";
  a.click();

  URL.revokeObjectURL(url);
}

