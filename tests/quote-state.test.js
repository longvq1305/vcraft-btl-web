const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, seedTestUsers } = require('./helpers/testDatabase');
const { QuoteService } = require('../src/services/quoteService');
const { todayInVietnam, isIsoDate } = require('../src/utils/date');

test('Quotation State Machine & Behavioral Invariants', async (t) => {
  let db;
  let users;
  let service;
  let quotes;
  let bids;

  t.beforeEach(() => {
    db = createTestDatabase();
    users = seedTestUsers(db);
    service = new QuoteService(db);
    quotes = service.quotes;
    bids = service.bids;
  });

  t.afterEach(() => {
    if (db) {
      db.close();
    }
  });

  await t.test('1. Full Lifecycle Happy Path (draft -> sent -> bidding -> accepted -> in_production -> delivered)', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Step 1: Buyer creates draft
    const draft = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt 200 lọ hoa gốm vuốt tay men rạn',
      description: 'Lọ hoa cao 25cm vuốt tay thủ công, men rạn truyền thống Bát Tràng.',
      category: 'Gốm sứ',
      quantity: 200,
      deadline: futureDate
    });

    assert.equal(draft.status, 'draft');
    assert.equal(draft.version, 0);
    assert.equal(draft.buyer_id, users.buyer1.id);
    assert.equal(draft.quantity, 200);

    // Step 2: Buyer sends draft to artisans
    const sent = service.sendQuote({
      quoteId: draft.id,
      buyerId: users.buyer1.id
    });

    assert.equal(sent.status, 'sent');
    assert.equal(sent.version, 1);

    // Verify targeted artisans: category 'Gốm sứ' matches artisanCeramic (id 2)
    const isTargeted = quotes.isArtisanTargeted(draft.id, users.artisanCeramic.id);
    assert.equal(isTargeted, true, 'Ceramic artisan must be targeted');

    // Step 3: First bid by targeted artisan transitions sent -> bidding
    const bid1 = service.submitOrUpdateBid({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 150000,
      leadDays: 12,
      completionDate,
      note: 'Cam kết men rạn chuẩn Bát Tràng, đóng hộp xốp từng sản phẩm.'
    });

    assert.equal(bid1.status, 'submitted');
    assert.equal(bid1.unit_price, 150000);

    const biddingQuote = quotes.findById(draft.id);
    assert.equal(biddingQuote.status, 'bidding', 'First bid must move quote to bidding');

    // Step 4: Buyer accepts bid with current version (optimistic locking)
    const accepted = service.acceptBid({
      quoteId: draft.id,
      buyerId: users.buyer1.id,
      bidId: bid1.id,
      version: biddingQuote.version
    });

    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.accepted_bid_id, bid1.id);

    const freshBid1 = bids.findById(bid1.id);
    assert.equal(freshBid1.status, 'accepted');

    // Step 5: Accepted artisan starts production (accepted -> in_production)
    const inProduction = service.startProduction({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id
    });

    assert.equal(inProduction.status, 'in_production');

    // Step 6: Accepted artisan delivers (in_production -> delivered)
    const delivered = service.deliverQuote({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id
    });

    assert.equal(delivered.status, 'delivered');
  });

  await t.test('2. Artisan Category Targeting & Fallback Rules', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Case A: Specific category match
    const q1 = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt 50 khăn lụa tơ tằm dệt thủ công',
      description: 'Khăn lụa tơ tằm nhuộm tự nhiên màu hoa sen.',
      category: 'Lụa tơ tằm',
      quantity: 50,
      deadline: futureDate
    });

    service.sendQuote({ quoteId: q1.id, buyerId: users.buyer1.id });

    assert.equal(quotes.isArtisanTargeted(q1.id, users.artisanSilk.id), true, 'Silk artisan must be targeted');
    assert.equal(quotes.isArtisanTargeted(q1.id, users.artisanPending.id), false, 'Pending artisan must NOT be targeted');

    // Case B: Category with no exact match targets ALL approved artisans
    const q2 = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt sản phẩm sơn mài thếp vàng',
      description: 'Hộp sơn mài trang trí hoa sen thếp vàng.',
      category: 'Sơn mài độc bản',
      quantity: 10,
      deadline: futureDate
    });

    service.sendQuote({ quoteId: q2.id, buyerId: users.buyer1.id });

    assert.equal(quotes.isArtisanTargeted(q2.id, users.artisanCeramic.id), true, 'Fallback targets approved artisan 1');
    assert.equal(quotes.isArtisanTargeted(q2.id, users.artisanSilk.id), true, 'Fallback targets approved artisan 2');
    assert.equal(quotes.isArtisanTargeted(q2.id, users.artisanBamboo.id), true, 'Fallback targets approved artisan 3');
    assert.equal(quotes.isArtisanTargeted(q2.id, users.artisanPending.id), false, 'Fallback must NOT target pending artisan');
  });

  await t.test('3. Ownership and Authorization Checks', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const quote = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt hàng riêng',
      description: 'Mô tả chi tiết sản phẩm thủ công.',
      category: 'Gốm sứ',
      quantity: 20,
      deadline: futureDate
    });

    // Non-owner (buyer2) cannot send buyer1's quote
    assert.throws(() => {
      service.sendQuote({ quoteId: quote.id, buyerId: users.buyer2.id });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Non-owner sending quote must throw 403 Forbidden');

    // Send quote by real owner
    service.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id });

    // Untargeted artisan cannot bid
    // Users: artisanSilk is not targeted for 'Gốm sứ'
    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanSilk.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá'
      });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Untargeted artisan bidding must throw 403 Forbidden');

    // Pending artisan cannot bid even if somehow called
    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanPending.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá'
      });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Pending artisan bidding must throw 403 Forbidden');

    // Valid bid from targeted artisanCeramic
    const bid = service.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 200000,
      leadDays: 7,
      completionDate,
      note: 'Chào giá gốm'
    });

    // Non-owner (buyer2) cannot accept bid
    const fresh = quotes.findById(quote.id);
    assert.throws(() => {
      service.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer2.id,
        bidId: bid.id,
        version: fresh.version
      });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Non-owner accepting bid must throw 403 Forbidden');
  });

  await t.test('4. Double Acceptance & Optimistic Concurrency Conflict (leaves winner unchanged)', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Create quote targeted to all (fallback category)
    const quote = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đơn hàng thi đua hai xưởng',
      description: 'Yêu cầu quy cách chung.',
      category: 'Đồ đa chất liệu',
      quantity: 50,
      deadline: futureDate
    });

    service.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id });

    // Two artisans bid
    const bidCeramic = service.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 300000,
      leadDays: 10,
      completionDate,
      note: 'Phương án gốm'
    });

    const bidBamboo = service.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanBamboo.id,
      unitPrice: 280000,
      leadDays: 8,
      completionDate,
      note: 'Phương án mây tre'
    });

    const freshQuote = quotes.findById(quote.id);
    const staleVersion = freshQuote.version;

    // Buyer accepts Ceramic bid
    service.acceptBid({
      quoteId: quote.id,
      buyerId: users.buyer1.id,
      bidId: bidCeramic.id,
      version: staleVersion
    });

    // Check winner is Ceramic
    const acceptedQuote = quotes.findById(quote.id);
    assert.equal(acceptedQuote.status, 'accepted');
    assert.equal(acceptedQuote.accepted_bid_id, bidCeramic.id);

    // Check rejected bid
    const rejectedBid = bids.findById(bidBamboo.id);
    assert.equal(rejectedBid.status, 'rejected');

    // Now attempt a SECOND / STALE acceptance for Bamboo with the old version
    assert.throws(() => {
      service.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer1.id,
        bidId: bidBamboo.id,
        version: staleVersion
      });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Second / stale acceptance must throw 409 Conflict');

    // Attempt second acceptance even with updated version
    assert.throws(() => {
      service.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer1.id,
        bidId: bidBamboo.id,
        version: acceptedQuote.version
      });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Acceptance on already accepted quote must throw 409 Conflict');

    // Verify first winner and status remain completely untouched
    const afterFailedAttempt = quotes.findById(quote.id);
    assert.equal(afterFailedAttempt.status, 'accepted');
    assert.equal(afterFailedAttempt.accepted_bid_id, bidCeramic.id, 'Winner MUST NOT change');

    const winningBid = bids.findById(bidCeramic.id);
    assert.equal(winningBid.status, 'accepted');

    const otherBid = bids.findById(bidBamboo.id);
    assert.equal(otherBid.status, 'rejected');
  });

  await t.test('5. Forbidden State Transitions (no skipped or backward states)', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const draft = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Kiểm tra chuyển trạng thái',
      description: 'Mô tả chi tiết sản phẩm.',
      category: 'Gốm sứ',
      quantity: 10,
      deadline: futureDate
    });

    // Cannot start production on draft (skipped state)
    assert.throws(() => {
      service.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    });

    // Cannot deliver on draft
    assert.throws(() => {
      service.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id });
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    });

    // Send quote
    service.sendQuote({ quoteId: draft.id, buyerId: users.buyer1.id });

    // Cannot send an already sent quote (backward/repeat transition)
    assert.throws(() => {
      service.sendQuote({ quoteId: draft.id, buyerId: users.buyer1.id });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Bid and accept
    const bid = service.submitOrUpdateBid({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 120000,
      leadDays: 5,
      completionDate,
      note: 'Chào giá'
    });

    const biddingQuote = quotes.findById(draft.id);
    service.acceptBid({
      quoteId: draft.id,
      buyerId: users.buyer1.id,
      bidId: bid.id,
      version: biddingQuote.version
    });

    // Cannot deliver directly from 'accepted' without 'in_production' (skipped state)
    assert.throws(() => {
      service.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Direct deliver from accepted must throw 409');

    // Move to in_production
    service.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id });

    // Cannot move to in_production again (duplicate transition)
    assert.throws(() => {
      service.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Cannot bid after accepted / in_production
    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: draft.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá lại'
      });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Deliver
    service.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id });

    // Cannot start production after delivered (backward transition)
    assert.throws(() => {
      service.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id });
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });
  });

  await t.test('6. Input Validation Boundaries', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const pastDate = '2020-01-01';

    // Past deadline rejected
    assert.throws(() => {
      service.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu ngày cũ',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: 10,
        deadline: pastDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Negative or zero quantity rejected
    assert.throws(() => {
      service.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu số lượng âm',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: -5,
        deadline: futureDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    assert.throws(() => {
      service.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu số lượng 0',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: 0,
        deadline: futureDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Valid quote for bid testing
    const quote = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Yêu cầu chuẩn',
      description: 'Mô tả chi tiết chuẩn.',
      category: 'Gốm sứ',
      quantity: 50,
      deadline: futureDate
    });
    service.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id });

    // Invalid unit price (zero or negative)
    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 0,
        leadDays: 5,
        completionDate: futureDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: -50000,
        leadDays: 5,
        completionDate: futureDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Invalid lead days (zero or negative)
    assert.throws(() => {
      service.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 100000,
        leadDays: -2,
        completionDate: futureDate
      });
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  await t.test('7. Chỉ chủ sở hữu được sửa hoặc xóa bản nháp', () => {
    const input = {
      buyerId: users.buyer1.id,
      title: 'Đặt bộ ấm trà',
      description: 'Bộ ấm chén men rạn thủ công.',
      category: 'Gốm sứ',
      quantity: 3,
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    };
    const draft = service.createQuote(input);
    const identity = { quoteId: draft.id, buyerId: input.buyerId };
    const otherBuyer = { quoteId: draft.id, buyerId: users.buyer2.id };

    assert.throws(() => service.getDraftForEdit(otherBuyer), { statusCode: 403 });
    assert.throws(() => service.updateDraft({ ...input, ...otherBuyer }), { statusCode: 403 });
    assert.throws(() => service.deleteDraft(otherBuyer), { statusCode: 403 });
    assert.equal(service.getDraftForEdit(identity).title, input.title);

    const changes = { title: 'Đặt khăn lụa', category: 'Lụa tơ tằm', quantity: 7 };
    const edited = service.updateDraft({ ...input, ...identity, ...changes });
    assert.equal(edited.status, 'draft');
    assert.equal(edited.title, changes.title);
    assert.equal(edited.category, changes.category);
    assert.equal(edited.quantity, changes.quantity);
    assert.equal(edited.version, draft.version + 1);

    const removable = service.createQuote(input);
    service.deleteDraft({ quoteId: removable.id, buyerId: input.buyerId });
    assert.equal(quotes.findById(removable.id), undefined);

    service.sendQuote(identity);
    assert.equal(quotes.isArtisanTargeted(draft.id, users.artisanSilk.id), true);
    assert.equal(quotes.isArtisanTargeted(draft.id, users.artisanCeramic.id), false);
    assert.throws(() => service.getDraftForEdit(identity), { statusCode: 409 });
    assert.throws(() => service.updateDraft({ ...input, ...identity }), { statusCode: 409 });
    assert.throws(() => service.deleteDraft(identity), { statusCode: 409 });
    assert.equal(quotes.findById(draft.id).status, 'sent');
  });

  await t.test('8. Hủy yêu cầu đang chào giá sẽ từ chối báo giá và khóa nhận báo giá mới', () => {
    const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const input = {
      buyerId: users.buyer1.id,
      title: 'Đặt bộ lọ gốm',
      description: 'Lọ gốm men rạn trang trí phòng khách.',
      category: 'Gốm sứ',
      quantity: 10,
      deadline
    };
    const draft = service.createQuote(input);
    const identity = { quoteId: draft.id, buyerId: input.buyerId };

    for (const shouldSend of [false, true]) {
      const otherDraft = service.createQuote(input);
      const otherIdentity = { ...identity, quoteId: otherDraft.id };
      if (shouldSend) service.sendQuote(otherIdentity);
      assert.equal(service.cancelQuote(otherIdentity).status, 'cancelled');
    }

    service.sendQuote(identity);
    const offer = {
      quoteId: draft.id, artisanId: users.artisanCeramic.id,
      unitPrice: 150000, leadDays: 5, completionDate: deadline
    };
    const bid = service.submitOrUpdateBid(offer);
    const bidding = quotes.findById(draft.id);
    assert.equal(bidding.status, 'bidding');
    assert.throws(() => service.cancelQuote({ ...identity, buyerId: users.buyer2.id }), { statusCode: 403 });

    const cancelled = service.cancelQuote(identity);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.version, bidding.version + 1);
    assert.equal(bids.findById(bid.id).status, 'rejected');
    assert.throws(() => service.cancelQuote(identity), { statusCode: 409 });
    assert.throws(() => service.submitOrUpdateBid(offer), { statusCode: 409 });
    assert.throws(() => service.acceptBid({ ...identity, bidId: bid.id, version: cancelled.version }), {
      statusCode: 409
    });
  });

  await t.test('9. Nghệ nhân sửa giá làm trang của người mua cũ đi: chốt theo version cũ bị 409', () => {
    const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const draft = service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt bình gốm quà tặng',
      description: 'Bình gốm men lam làm quà tặng đối tác.',
      category: 'Gốm sứ',
      quantity: 20,
      deadline
    });
    service.sendQuote({ quoteId: draft.id, buyerId: users.buyer1.id });
    const offer = {
      quoteId: draft.id, artisanId: users.artisanCeramic.id,
      unitPrice: 150000, leadDays: 5, completionDate: deadline
    };
    const bid = service.submitOrUpdateBid(offer);
    const seenByBuyer = quotes.findById(draft.id);

    service.submitOrUpdateBid({ ...offer, unitPrice: 400000 });
    assert.equal(quotes.findById(draft.id).version, seenByBuyer.version + 1);
    assert.throws(() => service.acceptBid({
      quoteId: draft.id, buyerId: users.buyer1.id, bidId: bid.id, version: seenByBuyer.version
    }), { statusCode: 409 });
    assert.equal(bids.findById(bid.id).status, 'submitted');

    const fresh = quotes.findById(draft.id);
    const accepted = service.acceptBid({
      quoteId: draft.id, buyerId: users.buyer1.id, bidId: bid.id, version: fresh.version
    });
    assert.equal(accepted.accepted_unit_price, 400000);
  });

  await t.test('10. "Hôm nay" tính theo giờ Việt Nam và ngày phải đúng dạng YYYY-MM-DD có thật', () => {
    // 01:30 ngày 25/11 giờ Việt Nam vẫn là 18:30 ngày 24/11 theo UTC.
    assert.equal(todayInVietnam(new Date('2026-11-24T18:30:00Z')), '2026-11-25');
    assert.equal(todayInVietnam(new Date('2026-11-24T16:59:00Z')), '2026-11-24');
    assert.equal(isIsoDate('2026-12-01'), true);
    for (const invalid of ['2026-02-30', '2026/12/01', '01-12-2026', '2026-12-1', 'Dec 1, 2026']) {
      assert.equal(isIsoDate(invalid), false, invalid);
    }

    const yesterdayVn = todayInVietnam(new Date(Date.now() - 86400000));
    assert.throws(() => service.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt lụa',
      description: 'Khăn lụa Vạn Phúc nhuộm chàm.',
      category: 'Lụa tơ tằm',
      quantity: 5,
      deadline: yesterdayVn
    }), { statusCode: 400 });
  });
});
