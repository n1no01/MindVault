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

  let MY_WALLET_PRINCIPAL_TEXT =
    "iw5be-m7e36-bn2ie-v5cu7-x5c4i-xsyin-j3iwx-oxaqt-6gh3g-zbafr-3ae";

  public type Note = {
    id : Nat;
    title : Text;
    text : Text;
    pinned : Bool;
  };

  // Stable state
  var notesByUserEntries : [(Principal, [Note])] = [];
  var premiumUsersEntries : [(Principal, Bool)] = [];
  var counter : Nat = 0;

  // Transient in‑memory maps
  transient var notesByUser =
    HashMap.HashMap<Principal, [Note]>(0, Principal.equal, Principal.hash);
  transient var premiumUsers =
    HashMap.HashMap<Principal, Bool>(0, Principal.equal, Principal.hash);

  system func postupgrade() {
    notesByUser :=
      HashMap.fromIter(notesByUserEntries.vals(), 0, Principal.equal, Principal.hash);
    premiumUsers :=
      HashMap.fromIter(premiumUsersEntries.vals(), 0, Principal.equal, Principal.hash);
  };

  system func preupgrade() {
    notesByUserEntries := Iter.toArray(notesByUser.entries());
    premiumUsersEntries := Iter.toArray(premiumUsers.entries());
  };

  // ---------- Note CRUD & premium logic ----------

  public shared ({ caller }) func create(title : Text, text : Text) : async Nat {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null [];
      };

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
    note.id;
  };

  public shared ({ caller }) func getNotes() : async [Note] {
    switch (notesByUser.get(caller)) {
      case (?n) Array.reverse(n);
      case null [];
    };
  };

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

  public shared ({ caller }) func getPinnedNotes() : async [Note] {
    let userNotes =
      switch (notesByUser.get(caller)) {
        case (?n) n;
        case null [];
      };
    Array.filter<Note>(userNotes, func (note) { note.pinned });
  };

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

  public shared query ({ caller }) func isPremium() : async Bool {
    switch (premiumUsers.get(caller)) {
      case (?status) status;
      case null false;
    }
  };

  public shared ({ caller }) func addPremium() : async () {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("Anonymous principal cannot be a premium user.");
    };
    premiumUsers.put(caller, true);
  };

  public shared query ({ caller }) func whoami() : async Text {
    Principal.toText(caller);
  };

  public shared query func userCount() : async Nat {
    notesByUser.size();
  };

  public shared query func premiumMemberCount() : async Nat {
    Array.filter<(Principal, Bool)>(
      Iter.toArray(premiumUsers.entries()),
      func ((_, isPremium)) { isPremium },
    ).size();
  };

  public shared query func premiumMemberPrincipals() : async [Principal] {
    Array.map<(Principal, Bool), Principal>(
      Array.filter<(Principal, Bool)>(
        Iter.toArray(premiumUsers.entries()),
        func ((_, isPremium)) { isPremium },
      ),
      func ((principal, _)) { principal },
    );
  };

  // ---------- ICP ledger helpers ----------

  func principalToSubaccount(p : Principal) : Blob {
    let pb : [Nat8] = Blob.toArray(Principal.toBlob(p));
    let bytes : [var Nat8] = Array.init<Nat8>(32, 0);
    bytes[0] := Nat8.fromNat(pb.size());
    var i = 0;
    label l while (i < pb.size() and i + 1 < 32) {
      bytes[i + 1] := pb[i];
      i += 1;
    };
    Blob.fromArrayMut(bytes);
  };

  public shared query ({ caller }) func getDepositAccount() : async Blob {
    let owner = Principal.fromActor(Backend);
    let sub = principalToSubaccount(caller);
    Principal.toLedgerAccount(owner, ?sub);
  };

  public shared ({ caller }) func sendHalfIcpToMyWallet()
    : async Result.Result<IcpLedger.BlockIndex, Text> {
    Debug.print("Sending 0.5 ICP from canister to my wallet");

    let amount : Tokens = { e8s = 50_000_000 };
    let fee : Tokens = { e8s = 10_000 };

    let myWalletPrincipal = Principal.fromText(MY_WALLET_PRINCIPAL_TEXT);
    let toSubaccount : ?IcpLedger.SubAccount = null;
    let fromSub : IcpLedger.SubAccount = principalToSubaccount(caller);

    let transferArgs : IcpLedger.TransferArgs = {
      memo = 0;
      amount = amount;
      fee = fee;
      from_subaccount = ?fromSub;
      to = Principal.toLedgerAccount(myWalletPrincipal, toSubaccount);
      created_at_time = null;
    };

    try {
      let transferResult = await IcpLedger.transfer(transferArgs);
      switch (transferResult) {
        case (#Err(transferError)) {
          #err("Couldn't transfer funds:\n" # debug_show (transferError));
        };
        case (#Ok(blockIndex)) {
          await addPremium();
          #ok blockIndex;
        };
      };
    } catch (e : Error) {
      #err("Reject message: " # Error.message(e));
    };
  };
}