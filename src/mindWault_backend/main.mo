import HashMap "mo:base/HashMap";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Error "mo:base/Error";
import Blob "mo:base/Blob";
import Nat8 "mo:base/Nat8";
import Result "mo:base/Result";
import Debug "mo:base/Debug";
import IcpLedger "canister:icp_ledger_canister";

persistent actor Backend {

    type Tokens = {
    e8s : Nat64;
  };

   let MY_WALLET_PRINCIPAL_TEXT = "iw5be-m7e36-bn2ie-v5cu7-x5c4i-xsyin-j3iwx-oxaqt-6gh3g-zbafr-3ae";
  public type Note = {
    id : Nat;
    title : Text;
    text : Text;
    pinned : Bool;
  };

  // Stable state
  // Map: Principal -> [Note]
  var notesByUserEntries : [(Principal, [Note])] = [];
  // Map: Principal -> Bool (premium status)
  var premiumUsersEntries : [(Principal, Bool)] = [];
  // Global note id counter
  var counter : Nat = 0;

  // Transient in‑memory maps
  transient var notesByUser =
    HashMap.HashMap<Principal, [Note]>(0, Principal.equal, Principal.hash);
  transient var premiumUsers =
    HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);

  // Restore state after upgrade
  system func postupgrade() {
    notesByUser :=
      HashMap.fromIter(notesByUserEntries.vals(), 0, Principal.equal, Principal.hash);
    premiumUsers :=
      HashMap.fromIter(premiumUsersEntries.vals(), 0, Principal.equal, Principal.hash);
  };

  // Save state before upgrade
  system func preupgrade() {
    notesByUserEntries := Iter.toArray(notesByUser.entries());
    premiumUsersEntries := Iter.toArray(premiumUsers.entries());
  };

  // Create a new note
  public shared ({ caller }) func create(title : Text, text : Text) : async Nat {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null [];
      };

    // Limit notes based on premium status
    let limit =
      switch (premiumUsers.get(caller)) {
        case (?true) 100;
        case null 20;
      };

    if (userNotes.size() >= limit) {
      throw Error.reject("Note limit reached. Upgrade to premium to add more notes.");
    };

    let note : Note = {
      id = counter;
      title = title;
      text = text;
      pinned = false;
    };
    notesByUser.put(caller, Array.append(userNotes, [note]));
    counter += 1;
    return note.id;
  };

  // Get all notes for the caller
  public shared ({ caller }) func getNotes() : async [Note] {
    return switch (notesByUser.get(caller)) {
      case (?n) Array.reverse(n);
      case null [];
    };
  };

  // Update a note's text and title (only by owner)
  public shared ({ caller }) func update(
    noteId : Nat,
    newText : Text,
    newTitle : Text,
  ) : async () {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null return;
      };
    let updatedNotes =
      Array.map<Note, Note>(
        userNotes,
        func (note) {
          if (note.id == noteId) {
            { note with title = newTitle; text = newText };
          } else {
            note;
          }
        },
      );
    notesByUser.put(caller, updatedNotes);
  };

  // Pin or unpin a note (only by owner)
  public shared ({ caller }) func setPinned(noteId : Nat, pinned : Bool) : async () {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null return;
      };
    let updatedNotes =
      Array.map<Note, Note>(
        userNotes,
        func (note) {
          if (note.id == noteId) {
            { note with pinned = pinned };
          } else {
            note;
          }
        },
      );
    notesByUser.put(caller, updatedNotes);
  };

  // Get only pinned notes for the caller
  public shared ({ caller }) func getPinnedNotes() : async [Note] {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null [];
      };
    return Array.filter<Note>(userNotes, func (note) { note.pinned });
  };

  // Delete a note (only by owner)
  public shared ({ caller }) func delete(noteId : Nat) : async () {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null return;
      };
    let filteredNotes =
      Array.filter<Note>(userNotes, func (note) { note.id != noteId });
    if (filteredNotes.size() == 0) {
      ignore notesByUser.remove(caller);
    } else {
      notesByUser.put(caller, filteredNotes);
    };
  };

  // Check if a user is premium
  public shared query ({ caller }) func isPremium() : async Bool {
    switch (premiumUsers.get(caller)) {
      case (?status) status;
      case null false;
    }
  };

  // Mark a user as premium (call after ICP payment)
  public shared ({ caller }) func addPremium() : async () {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("Anonymous principal cannot be a premium user.");
    };
    premiumUsers.put(caller, true);
  };

  public shared query ({ caller }) func whoami() : async Text {
    return Principal.toText(caller);
  };

  // Returns the number of users (principals) who have notes
  public shared query func userCount() : async Nat {
    notesByUser.size();
  };

  // Returns the number of premium members
  public shared query func premiumMemberCount() : async Nat {
    Array.filter<(Principal, Bool)>(
      Iter.toArray(premiumUsers.entries()),
      func ((_, isPremium)) { isPremium },
    ).size();
  };

  // Returns the principals of all premium members
  public shared query func premiumMemberPrincipals() : async [Principal] {
    Array.map<(Principal, Bool), Principal>(
      Array.filter<(Principal, Bool)>(
        Iter.toArray(premiumUsers.entries()),
        func ((_, isPremium)) { isPremium },
      ),
      func ((principal, _)) { principal },
    );
  };

  func principalToSubaccount(p : Principal) : Blob {
    let pb : [Nat8] = Blob.toArray(Principal.toBlob(p));
    let bytes : [var Nat8] = Array.init<Nat8>(32, 0);
    // store length in first byte, then principal bytes
    bytes[0] := Nat8.fromNat(pb.size());
    var i = 0;
    label l while (i < pb.size() and i + 1 < 32) {
      bytes[i + 1] := pb[i];
      i += 1;
    };
    // NOTE: use fromArrayMut because `bytes` is [var Nat8]
    Blob.fromArrayMut(bytes)
};

// Return the ICP deposit account identifier for the caller
public shared query ({ caller }) func getDepositAccount() : async Blob {
  let owner = Principal.fromActor(Backend);
  let sub = principalToSubaccount(caller);
  let accountId = Principal.toLedgerAccount(owner, ?sub);
  return accountId;
};

public shared ({ caller }) func sendHalfIcpToMyWallet()
    : async Result.Result<IcpLedger.BlockIndex, Text> {
    Debug.print("Sending 0.5 ICP from canister to my wallet");

    // 0.5 ICP = 50_000_000 e8s
    let amount : Tokens = { e8s = 50_000_000 };

    // Standard ICP transfer fee = 10_000 e8s
    let fee : Tokens = { e8s = 10_000 };

    // Your wallet principal
    let myWalletPrincipal = Principal.fromText(MY_WALLET_PRINCIPAL_TEXT);

    // Use default subaccount for your wallet (null)
    let toSubaccount : ?IcpLedger.SubAccount = null;

    let fromSub : IcpLedger.SubAccount = principalToSubaccount(caller);

    // Build TransferArgs exactly like in the ICP transfer sample
    let transferArgs : IcpLedger.TransferArgs = {
      // can be used to distinguish between transactions
      memo = 0;
      // the amount we want to transfer
      amount = amount;
      // the ICP ledger charges 10_000 e8s for a transfer
      fee = fee;
      // we are transferring from the canister's default subaccount
      from_subaccount = ?fromSub;
      // convert wallet principal + subaccount into an account identifier
      to = Principal.toLedgerAccount(myWalletPrincipal, toSubaccount);
      // if not specified, this is set to the current ICP time
      created_at_time = null;
    };

    try {
      // initiate the transfer
      let transferResult = await IcpLedger.transfer(transferArgs);

      // check if the transfer was successful
      switch (transferResult) {
        case (#Err(transferError)) {
          return #err("Couldn't transfer funds:\n" # debug_show (transferError));
        };
        case (#Ok(blockIndex)) {
          // on success, mark the caller as premium
          await addPremium();
          return #ok blockIndex;
        };
      };
    } catch (e : Error) {
      // catch any errors that might occur during the transfer
      return #err("Reject message: " # Error.message(e));
    };
  };
}