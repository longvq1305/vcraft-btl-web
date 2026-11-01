const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, seedTestUsers } = require('./helpers/testDatabase');
const quoteService = require('../src/services/quoteService');
const Quote = require('../src/models/Quote');
const Bid = require('../src/models/Bid');

test('Quotation State Machine & Behavioral Invariants', async (t) => {
  let db;
  let users;

  t.beforeEach(() => {
    db = createTestDatabase();
    users = seedTestUsers(db);
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
    const draft = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt 200 lọ hoa gốm vuốt tay men rạn',
      description: 'Lọ hoa cao 25cm vuốt tay thủ công, men rạn truyền thống Bát Tràng.',
      category: 'Gốm sứ',
      quantity: 200,
      deadline: futureDate
    }, db);

    assert.equal(draft.status, 'draft');
    assert.equal(draft.version, 0);
    assert.equal(draft.buyer_id, users.buyer1.id);
    assert.equal(draft.quantity, 200);

    // Step 2: Buyer sends draft to artisans
    const sent = quoteService.sendQuote({
      quoteId: draft.id,
      buyerId: users.buyer1.id
    }, db);

    assert.equal(sent.status, 'sent');
    assert.equal(sent.version, 1);

    // Verify targeted artisans: category 'Gốm sứ' matches artisanCeramic (id 2)
    const isTargeted = Quote.isArtisanTargeted(draft.id, users.artisanCeramic.id, db);
    assert.equal(isTargeted, true, 'Ceramic artisan must be targeted');

    // Step 3: First bid by targeted artisan transitions sent -> bidding
    const bid1 = quoteService.submitOrUpdateBid({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 150000,
      leadDays: 12,
      completionDate,
      note: 'Cam kết men rạn chuẩn Bát Tràng, đóng hộp xốp từng sản phẩm.'
    }, db);

    assert.equal(bid1.status, 'submitted');
    assert.equal(bid1.unit_price, 150000);

    const biddingQuote = Quote.findById(draft.id, db);
    assert.equal(biddingQuote.status, 'bidding', 'First bid must move quote to bidding');

    // Step 4: Buyer accepts bid with current version (optimistic locking)
    const accepted = quoteService.acceptBid({
      quoteId: draft.id,
      buyerId: users.buyer1.id,
      bidId: bid1.id,
      version: biddingQuote.version
    }, db);

    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.accepted_bid_id, bid1.id);

    const freshBid1 = Bid.findById(bid1.id, db);
    assert.equal(freshBid1.status, 'accepted');

    // Step 5: Accepted artisan starts production (accepted -> in_production)
    const inProduction = quoteService.startProduction({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id
    }, db);

    assert.equal(inProduction.status, 'in_production');

    // Step 6: Accepted artisan delivers (in_production -> delivered)
    const delivered = quoteService.deliverQuote({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id
    }, db);

    assert.equal(delivered.status, 'delivered');
  });

  await t.test('2. Artisan Category Targeting & Fallback Rules', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Case A: Specific category match
    const q1 = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt 50 khăn lụa tơ tằm dệt thủ công',
      description: 'Khăn lụa tơ tằm nhuộm tự nhiên màu hoa sen.',
      category: 'Lụa tơ tằm',
      quantity: 50,
      deadline: futureDate
    }, db);

    quoteService.sendQuote({ quoteId: q1.id, buyerId: users.buyer1.id }, db);

    assert.equal(Quote.isArtisanTargeted(q1.id, users.artisanSilk.id, db), true, 'Silk artisan must be targeted');
    assert.equal(Quote.isArtisanTargeted(q1.id, users.artisanPending.id, db), false, 'Pending artisan must NOT be targeted');

    // Case B: Category with no exact match targets ALL approved artisans
    const q2 = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt sản phẩm sơn mài thếp vàng',
      description: 'Hộp sơn mài trang trí hoa sen thếp vàng.',
      category: 'Sơn mài độc bản',
      quantity: 10,
      deadline: futureDate
    }, db);

    quoteService.sendQuote({ quoteId: q2.id, buyerId: users.buyer1.id }, db);

    assert.equal(Quote.isArtisanTargeted(q2.id, users.artisanCeramic.id, db), true, 'Fallback targets approved artisan 1');
    assert.equal(Quote.isArtisanTargeted(q2.id, users.artisanSilk.id, db), true, 'Fallback targets approved artisan 2');
    assert.equal(Quote.isArtisanTargeted(q2.id, users.artisanBamboo.id, db), true, 'Fallback targets approved artisan 3');
    assert.equal(Quote.isArtisanTargeted(q2.id, users.artisanPending.id, db), false, 'Fallback must NOT target pending artisan');
  });

  await t.test('3. Ownership and Authorization Checks', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const quote = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đặt hàng riêng',
      description: 'Mô tả chi tiết sản phẩm thủ công.',
      category: 'Gốm sứ',
      quantity: 20,
      deadline: futureDate
    }, db);

    // Non-owner (buyer2) cannot send buyer1's quote
    assert.throws(() => {
      quoteService.sendQuote({ quoteId: quote.id, buyerId: users.buyer2.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Non-owner sending quote must throw 403 Forbidden');

    // Send quote by real owner
    quoteService.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id }, db);

    // Untargeted artisan cannot bid
    // Users: artisanSilk is not targeted for 'Gốm sứ'
    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanSilk.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá'
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Untargeted artisan bidding must throw 403 Forbidden');

    // Pending artisan cannot bid even if somehow called
    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanPending.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá'
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Pending artisan bidding must throw 403 Forbidden');

    // Valid bid from targeted artisanCeramic
    const bid = quoteService.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 200000,
      leadDays: 7,
      completionDate,
      note: 'Chào giá gốm'
    }, db);

    // Non-owner (buyer2) cannot accept bid
    const fresh = Quote.findById(quote.id, db);
    assert.throws(() => {
      quoteService.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer2.id,
        bidId: bid.id,
        version: fresh.version
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }, 'Non-owner accepting bid must throw 403 Forbidden');
  });

  await t.test('4. Double Acceptance & Optimistic Concurrency Conflict (leaves winner unchanged)', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Create quote targeted to all (fallback category)
    const quote = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Đơn hàng thi đua hai xưởng',
      description: 'Yêu cầu quy cách chung.',
      category: 'Đồ đa chất liệu',
      quantity: 50,
      deadline: futureDate
    }, db);

    quoteService.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id }, db);

    // Two artisans bid
    const bidCeramic = quoteService.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 300000,
      leadDays: 10,
      completionDate,
      note: 'Phương án gốm'
    }, db);

    const bidBamboo = quoteService.submitOrUpdateBid({
      quoteId: quote.id,
      artisanId: users.artisanBamboo.id,
      unitPrice: 280000,
      leadDays: 8,
      completionDate,
      note: 'Phương án mây tre'
    }, db);

    const freshQuote = Quote.findById(quote.id, db);
    const staleVersion = freshQuote.version;

    // Buyer accepts Ceramic bid
    quoteService.acceptBid({
      quoteId: quote.id,
      buyerId: users.buyer1.id,
      bidId: bidCeramic.id,
      version: staleVersion
    }, db);

    // Check winner is Ceramic
    const acceptedQuote = Quote.findById(quote.id, db);
    assert.equal(acceptedQuote.status, 'accepted');
    assert.equal(acceptedQuote.accepted_bid_id, bidCeramic.id);

    // Check rejected bid
    const rejectedBid = Bid.findById(bidBamboo.id, db);
    assert.equal(rejectedBid.status, 'rejected');

    // Now attempt a SECOND / STALE acceptance for Bamboo with the old version
    assert.throws(() => {
      quoteService.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer1.id,
        bidId: bidBamboo.id,
        version: staleVersion
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Second / stale acceptance must throw 409 Conflict');

    // Attempt second acceptance even with updated version
    assert.throws(() => {
      quoteService.acceptBid({
        quoteId: quote.id,
        buyerId: users.buyer1.id,
        bidId: bidBamboo.id,
        version: acceptedQuote.version
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Acceptance on already accepted quote must throw 409 Conflict');

    // Verify first winner and status remain completely untouched
    const afterFailedAttempt = Quote.findById(quote.id, db);
    assert.equal(afterFailedAttempt.status, 'accepted');
    assert.equal(afterFailedAttempt.accepted_bid_id, bidCeramic.id, 'Winner MUST NOT change');

    const winningBid = Bid.findById(bidCeramic.id, db);
    assert.equal(winningBid.status, 'accepted');

    const otherBid = Bid.findById(bidBamboo.id, db);
    assert.equal(otherBid.status, 'rejected');
  });

  await t.test('5. Forbidden State Transitions (no skipped or backward states)', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const completionDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const draft = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Kiểm tra chuyển trạng thái',
      description: 'Mô tả chi tiết sản phẩm.',
      category: 'Gốm sứ',
      quantity: 10,
      deadline: futureDate
    }, db);

    // Cannot start production on draft (skipped state)
    assert.throws(() => {
      quoteService.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    });

    // Cannot deliver on draft
    assert.throws(() => {
      quoteService.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    });

    // Send quote
    quoteService.sendQuote({ quoteId: draft.id, buyerId: users.buyer1.id }, db);

    // Cannot send an already sent quote (backward/repeat transition)
    assert.throws(() => {
      quoteService.sendQuote({ quoteId: draft.id, buyerId: users.buyer1.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Bid and accept
    const bid = quoteService.submitOrUpdateBid({
      quoteId: draft.id,
      artisanId: users.artisanCeramic.id,
      unitPrice: 120000,
      leadDays: 5,
      completionDate,
      note: 'Chào giá'
    }, db);

    const biddingQuote = Quote.findById(draft.id, db);
    quoteService.acceptBid({
      quoteId: draft.id,
      buyerId: users.buyer1.id,
      bidId: bid.id,
      version: biddingQuote.version
    }, db);

    // Cannot deliver directly from 'accepted' without 'in_production' (skipped state)
    assert.throws(() => {
      quoteService.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }, 'Direct deliver from accepted must throw 409');

    // Move to in_production
    quoteService.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);

    // Cannot move to in_production again (duplicate transition)
    assert.throws(() => {
      quoteService.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Cannot bid after accepted / in_production
    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: draft.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 100000,
        leadDays: 5,
        completionDate,
        note: 'Chào giá lại'
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    });

    // Deliver
    quoteService.deliverQuote({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);

    // Cannot start production after delivered (backward transition)
    assert.throws(() => {
      quoteService.startProduction({ quoteId: draft.id, artisanId: users.artisanCeramic.id }, db);
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
      quoteService.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu ngày cũ',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: 10,
        deadline: pastDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Negative or zero quantity rejected
    assert.throws(() => {
      quoteService.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu số lượng âm',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: -5,
        deadline: futureDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    assert.throws(() => {
      quoteService.createQuote({
        buyerId: users.buyer1.id,
        title: 'Yêu cầu số lượng 0',
        description: 'Mô tả chi tiết sản phẩm.',
        category: 'Gốm sứ',
        quantity: 0,
        deadline: futureDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Valid quote for bid testing
    const quote = quoteService.createQuote({
      buyerId: users.buyer1.id,
      title: 'Yêu cầu chuẩn',
      description: 'Mô tả chi tiết chuẩn.',
      category: 'Gốm sứ',
      quantity: 50,
      deadline: futureDate
    }, db);
    quoteService.sendQuote({ quoteId: quote.id, buyerId: users.buyer1.id }, db);

    // Invalid unit price (zero or negative)
    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 0,
        leadDays: 5,
        completionDate: futureDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: -50000,
        leadDays: 5,
        completionDate: futureDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    // Invalid lead days (zero or negative)
    assert.throws(() => {
      quoteService.submitOrUpdateBid({
        quoteId: quote.id,
        artisanId: users.artisanCeramic.id,
        unitPrice: 100000,
        leadDays: -2,
        completionDate: futureDate
      }, db);
    }, (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });
});
