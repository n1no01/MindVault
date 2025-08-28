import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Array "mo:base/Array";

persistent actor {
  public type Note = {
    id : Nat;
    title : Text;
    text : Text;
  };

  // Map: Principal -> [Note]
  stable var notesByUserEntries : [(Principal, [Note])] = [];
  transient var notesByUser = HashMap.HashMap<Principal, [Note]>(0, Principal.equal, Principal.hash);

  // Global note id counter
  stable var counter : Nat = 0;

  // Restore state after upgrade
  system func postupgrade() {
    notesByUser := HashMap.fromIter(notesByUserEntries.vals(), 0, Principal.equal, Principal.hash);
  };

  // Save state before upgrade
  system func preupgrade() {
    notesByUserEntries := Iter.toArray(notesByUser.entries());
  };

  // Create a new note
  public shared({caller}) func create(title : Text, text : Text) : async Nat {
    let userNotes = switch (notesByUser.get(caller)) {
      case (?n) n;
      case null [];
    };
    let note : Note = { id = counter; title = title; text = text };
    notesByUser.put(caller, Array.append(userNotes, [note]));
    counter += 1;
    return note.id;
  };

  // Get all notes for the caller
  public shared({caller}) func getNotes() : async [Note] {
   return switch (notesByUser.get(caller)) {
      case (?n) Array.reverse(n);
      case null [];
    }
  };

  // Update a note's text (only by owner)
  public shared({caller}) func update(noteId : Nat, newText : Text, newTitle: Text) : async () {
    let userNotes = switch (notesByUser.get(caller)) {
      case (?n) n;
      case null return;
    };
    let updatedNotes = Array.map<Note, Note>(userNotes, func(note) {
      if (note.id == noteId) { { note with title = newTitle; text = newText} } else { note }
    });
    notesByUser.put(caller, updatedNotes);
  };

  // Delete a note (only by owner)
  public shared({caller}) func delete(noteId : Nat) : async () {
    let userNotes = switch (notesByUser.get(caller)) {
      case (?n) n;
      case null return;
    };
    let filteredNotes = Array.filter<Note>(userNotes, func(note) { note.id != noteId });
    if (filteredNotes.size() == 0) {
    // Remove the principal from the map if no notes remain
      ignore notesByUser.remove(caller);
    } else {
      notesByUser.put(caller, filteredNotes);
    };
  };

  public shared query ({caller}) func whoami() : async Text {
    return Principal.toText(caller);
  };

  // Returns the number of users (principals) who have notes
  public shared query func userCount() : async Nat {
    notesByUser.size();
  }
}