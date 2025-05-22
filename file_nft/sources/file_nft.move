module file_nft::file_nft {
    use sui::url::{Url};
    use std::string::{String, utf8};
    use sui::object::{UID, ID, new, id};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::{TxContext, sender};
    use sui::coin::{Coin, value};
    use sui::sui::SUI;
    use std::vector;
    

    /// 0 = 파일, 1 = 메모리
    public struct FileNFT has key, store {
        id: UID,
        blob_id: String,
        file_name: String,
        file_size: u64,
        owner: address,
        resource_type: u8,
        collection_id: ID,  // NFT가 속한 컬렉션의 ID
    }

    /// NFT 컬렉션 정보
    public struct Collection has key, store {
        id: UID,
        name: String,
        max_supply: u64,
        minted: u64,
        mint_price: u64,
        owner: address,
    }

    public struct NFTMinted has copy, drop {
        nft_id: ID,
        collection_id: ID,
        blob_id: String,
        file_name: String,
        owner: address,
        file_size: u64,
        resource_type: u8,
    }

    // Seal 프로토콜 이벤트
    public struct SealApproved has copy, drop {
        collection_id: ID,
        approved_id: vector<u8>,
        approved_by: address
    }

    /// 컬렉션 생성
    public entry fun    _collection(
        name: vector<u8>,
        max_supply: u64,
        mint_price: u64,
        ctx: &mut TxContext
    ) {
        let collection = Collection {
            id: new(ctx),
            name: utf8(name),
            max_supply,
            minted: 0, 
            mint_price,
            owner: sender(ctx),
        };
        transfer::public_transfer(collection, sender(ctx));
    }

    /// 컬렉션 정책 변경 (소유자만 가능)
    public entry fun set_mint_price(
        collection: &mut Collection,
        new_price: u64,
        ctx: &mut TxContext
    ) {
        assert!(sender(ctx) == collection.owner, 1);
        collection.mint_price = new_price;
    }

    public entry fun set_max_supply(
        collection: &mut Collection,
        new_max_supply: u64,
        ctx: &mut TxContext
    ) {
        assert!(sender(ctx) == collection.owner, 1);
        assert!(new_max_supply >= collection.minted, 2);
        collection.max_supply = new_max_supply;
    }

    /// NFT 민팅
    public entry fun mint_nft(
        collection: &mut Collection,
        blob_id: vector<u8>,
        file_name: vector<u8>,
        file_size: u64,
        resource_type: u8,
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        // 컬렉션 제한 체크
        assert!(collection.minted < collection.max_supply, 0);
        assert!(value(&payment) >= collection.mint_price, 3);

        // 수수료를 컬렉션 소유자에게 송금
        transfer::public_transfer(payment, collection.owner);

        let recipient = sender(ctx);
        let nft = FileNFT {
            id: new(ctx),
            blob_id: utf8(blob_id),
            file_name: utf8(file_name),
            file_size,
            owner: recipient,
            resource_type,
            collection_id: id(collection),
        };
        collection.minted = collection.minted + 1;

        event::emit(NFTMinted {
            nft_id: id(&nft),
            collection_id: id(collection),
            blob_id: nft.blob_id,
            file_name: nft.file_name,
            owner: recipient,
            file_size,
            resource_type,
        });
        transfer::public_transfer(nft, recipient);
    }

    /// Seal 프로토콜 승인 함수
    public fun seal_approve(id: vector<u8>, nft: &FileNFT, ctx: &TxContext): bool {
        // NFT 소유자만 승인 가능
        let is_approved = sender(ctx) == nft.owner;
        
        if (is_approved) {
            event::emit(SealApproved {
                collection_id: nft.collection_id,
                approved_id: id,
                approved_by: sender(ctx)
            });
        };
        
        is_approved
    }

    /// NFT 전송
    public entry fun transfer_nft(
        nft: FileNFT,
        recipient: address,
        _ctx: &mut TxContext
    ) {
        transfer::public_transfer(nft, recipient);
    }

    /// Getter 함수들
    public fun get_blob_id(nft: &FileNFT): &String { &nft.blob_id }
    public fun get_file_name(nft: &FileNFT): &String { &nft.file_name }
    public fun get_file_size(nft: &FileNFT): u64 { nft.file_size }
    public fun get_owner(nft: &FileNFT): address { nft.owner }
    public fun get_resource_type(nft: &FileNFT): u8 { nft.resource_type }
    public fun get_collection_id(nft: &FileNFT): ID { nft.collection_id }
}
