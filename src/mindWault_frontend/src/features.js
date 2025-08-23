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


