module file_nft::file_nft {
    use sui::url::{Url};
    use std::string::{String, utf8};
    use sui::object::{UID, ID, new, id};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::{TxContext, sender};

    public struct FileNFT has key, store {
        id: UID,
        blob_id: String,
        file_name: String,
        end_epoch: u64,
        file_size: u64,
        owner: address,
    }

    public struct AdminCap has key, store {
        id: UID,
        max_supply: u64,
        minted: u64,
        mint_price: u64,
        owner: address,
    }

    public struct NFTMinted has copy, drop {
        nft_id: ID,
        blob_id: String,
        file_name: String,
        end_epoch: u64,
        owner: address,
        file_size: u64,
    }

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: new(ctx),
            max_supply: 10000,
            minted: 0,
            mint_price: 100_000_000,
            owner: sender(ctx),
        };
        transfer::public_transfer(admin_cap, sender(ctx));
    }

    public entry fun mint(
        admin_cap: &mut AdminCap,
        blob_id: vector<u8>,
        file_name: vector<u8>,
        end_epoch: u64,
        file_size: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(admin_cap.minted < admin_cap.max_supply, 0);
        let nft = FileNFT {
            id: new(ctx),
            blob_id: utf8(blob_id),
            file_name: utf8(file_name),
            end_epoch,
            file_size,
            owner: recipient,
        };
        admin_cap.minted = admin_cap.minted + 1;
        event::emit(NFTMinted {
            nft_id: id(&nft),
            blob_id: nft.blob_id,
            file_name: nft.file_name,
            end_epoch,
            owner: recipient,
            file_size,
        });
        transfer::public_transfer(nft, recipient);
    }

    public entry fun set_mint_price(
        admin_cap: &mut AdminCap,
        new_price: u64,
        ctx: &mut TxContext
    ) {
        assert!(sender(ctx) == admin_cap.owner, 1);
        admin_cap.mint_price = new_price;
    }

    public entry fun set_max_supply(
        admin_cap: &mut AdminCap,
        new_max_supply: u64,
        ctx: &mut TxContext
    ) {
        assert!(sender(ctx) == admin_cap.owner, 1);
        assert!(new_max_supply >= admin_cap.minted, 2);
        admin_cap.max_supply = new_max_supply;
    }

    public fun verify_access(nft: &FileNFT, ctx: &TxContext): bool {
        sender(ctx) == nft.owner
    }

    public fun get_blob_id(nft: &FileNFT): &String { &nft.blob_id }
    public fun get_file_name(nft: &FileNFT): &String { &nft.file_name }
    public fun get_end_epoch(nft: &FileNFT): u64 { nft.end_epoch }
    public fun get_file_size(nft: &FileNFT): u64 { nft.file_size }
    public fun get_owner(nft: &FileNFT): address { nft.owner }
}
