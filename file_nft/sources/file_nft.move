module file_nft::file_nft {
    use std::string::{String, utf8};
    use std::vector;
    use sui::object::{UID, ID, new, id};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::{TxContext, sender};
    use sui::coin::{Coin, value};
    use sui::sui::SUI;

    /// Collection struct
    public struct Collection has key, store {
        id: UID,
        collection_name: String,
        max_supply: u64,
        mint_price: u64,
        blob_id: String,
        file_name: String,
        file_size: u64,
        end_epoch: u64,
        owner: address,
        resource_type: u8, // 0 = file, 1 = memory
        minted: u64,
    }

    /// Acess authority
    public struct AccessNFT has key, store {
        id: UID,
        collection_id: ID,
        owner: address,
    }

    public struct NFTMinted has copy, drop {
        nft_id: ID,
        collection_id: ID,
        owner: address,
    }

    public struct SealApproved has copy, drop {
        collection_id: ID,
        approved_id: vector<u8>,
        approved_by: address,
    }

    /// create collection (metadata comes later)
    public entry fun create_collection(
        name: vector<u8>,
        max_supply: u64,
        mint_price: u64,
        ctx: &mut TxContext
    ) {
        let collection = Collection {
            id: new(ctx),
            collection_name: utf8(name),
            max_supply,
            mint_price,
            blob_id: utf8(b""),
            file_name: utf8(b""),
            file_size: 0,
            end_epoch: 0,
            resource_type: 0,
            minted: 0,
            owner: sender(ctx),
        };
        transfer::public_transfer(collection, sender(ctx));
    }

    /// update collection metadata (partial update supported)
    public entry fun update_collection_metadata(
        collection: &mut Collection,
        new_blob_id: vector<u8>,
        new_file_name: vector<u8>,
        new_file_size: u64,
        new_resource_type: u8,
        new_end_epoch: u64,
        ctx: &mut TxContext
    ) {
        assert!(sender(ctx) == collection.owner, 0);

        if (vector::length(&new_blob_id) > 0) {
            collection.blob_id = utf8(new_blob_id);
        }
        if (vector::length(&new_file_name) > 0) {
            collection.file_name = utf8(new_file_name);
        }
        if (new_file_size != 0) {
            collection.file_size = new_file_size;
        }
        if (new_end_epoch != 0) {
            collection.end_epoch = new_end_epoch;
        }
        collection.resource_type = new_resource_type;
    }

    /// minting nft
    public entry fun mint_access_nft(
        collection: &mut Collection,
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(collection.minted < collection.max_supply, 1);
        assert!(value(&payment) == collection.mint_price, 2);
        transfer::public_transfer(payment, collection.owner);

        let recipient = sender(ctx);
        let nft = AccessNFT {
            id: new(ctx),
            collection_id: id(collection),
            owner: recipient,
        };

        collection.minted = collection.minted + 1;

        event::emit(NFTMinted {
            nft_id: id(&nft),
            collection_id: id(collection),
            owner: recipient,
        });

        transfer::public_transfer(nft, recipient);
    }

    /// seal approve
    public fun seal_approve(id: vector<u8>, nft: &AccessNFT, ctx: &TxContext): bool {
        let is_owner = sender(ctx) == nft.owner;
        if (is_owner) {
            event::emit(SealApproved {
                collection_id: nft.collection_id,
                approved_id: id,
                approved_by: sender(ctx),
            });
        };
        is_owner
    }

    /// transfer nft
    public entry fun transfer_access_nft(nft: AccessNFT, recipient: address, _ctx: &mut TxContext) {
        transfer::public_transfer(nft, recipient);
    }

}
