import { describe, expect, it } from 'vitest';
import type { DayRecord, InboxItem, Review } from '../types/contract';
import {
  dayFromRow,
  dayRow,
  inboxFromRow,
  inboxRow,
  reviewFromRow,
  reviewRow,
} from './supabase';

// Round-trip: local → remote row → local must be identity for every field the
// backup carries. A field that survives one way but not the other is a silent
// restore loss (the AG-009 A3 backup gap).

const USER = 'user-1';

describe('review row round-trip', () => {
  it('preserves every field including skippedAt', () => {
    const review: Review = {
      cardId: 'card-1',
      state: 'learning',
      due: '2026-10-01',
      intervalDays: 1,
      ease: 2.5,
      reps: 3,
      lapses: 2,
      lastGrade: 'again',
      lastSeenAt: 1787700000000,
      skippedAt: 1787700099999,
    };
    const row = reviewRow(review, USER);
    expect(row.user_id).toBe(USER);
    expect(row.skipped_at).toBe(new Date(review.skippedAt!).toISOString());
    expect(reviewFromRow(row)).toEqual(review);
  });

  it('maps absent optionals to null and back to undefined', () => {
    const review: Review = {
      cardId: 'card-2',
      state: 'new',
      due: '2026-10-01',
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
    };
    const row = reviewRow(review, USER);
    expect(row.last_grade).toBeNull();
    expect(row.last_seen_at).toBeNull();
    expect(row.skipped_at).toBeNull();
    expect(reviewFromRow(row)).toEqual(review);
  });
});

describe('day row round-trip', () => {
  it('preserves xp, spokenReps, challenge and challengeResult', () => {
    const day: DayRecord = {
      date: '2026-09-28',
      coreThreeDone: true,
      cardsCompleted: 12,
      secondsActive: 480,
      urgesRedirected: 2,
      bestMptSec: 18.5,
      labSessionDone: true,
      labSeconds: 300,
      xp: 17,
      spokenReps: 4,
      challenge: {
        date: '2026-09-28',
        title: 'Talk about the monsoon jam',
        situationCardId: 'sit-incident-05',
        useWord: 'gridlock',
        avoidPhrase: 'do the needful',
        voiceGoal: 'slower',
        targetSec: 60,
      },
      challengeResult: {
        recordingId: 'rec-9',
        longEnough: true,
        usedWord: true,
        avoidedPhrase: null,
        voiceGoalMet: false,
        done: false,
      },
    };
    const row = dayRow(day, USER);
    expect(row.user_id).toBe(USER);
    expect(row.xp).toBe(17);
    expect(row.spoken_reps).toBe(4);
    expect(row.challenge).toEqual(day.challenge);
    expect(row.challenge_result).toEqual(day.challengeResult);
    expect(dayFromRow(row)).toEqual(day);
  });

  it('maps absent optionals to defaults/null and back to undefined', () => {
    const day: DayRecord = {
      date: '2026-09-29',
      coreThreeDone: false,
      cardsCompleted: 0,
      secondsActive: 30,
      urgesRedirected: 0,
    };
    const row = dayRow(day, USER);
    expect(row.xp).toBe(0);
    expect(row.spoken_reps).toBe(0);
    expect(row.challenge).toBeNull();
    expect(row.challenge_result).toBeNull();
    // lab_session_done/lab_seconds/xp/spoken_reps are not-null columns with
    // defaults, so a restored row always materialises them — absence cannot
    // survive the trip. Values are equivalent to undefined for every reader.
    expect(dayFromRow(row)).toEqual({
      ...day,
      labSessionDone: false,
      labSeconds: 0,
      xp: 0,
      spokenReps: 0,
    });
  });
});

describe('inbox row round-trip', () => {
  it('preserves the coach fields kind, subject, fix, failReason, attempts, origin', () => {
    const item: InboxItem = {
      id: 'ib-1',
      createdAt: 1787700000000,
      text: 'I keep saying "revert back"',
      status: 'processed',
      processedAt: 1787700600000,
      generatedCardIds: ['card-a', 'card-b'],
      kind: 'mistake',
      subject: 'revert back',
      fix: 'revert',
      failReason: 'drafts failed verify',
      attempts: 2,
      origin: 'recording',
    };
    const row = inboxRow(item, USER);
    expect(row.user_id).toBe(USER);
    expect(row.kind).toBe('mistake');
    expect(row.subject).toBe('revert back');
    expect(row.fix).toBe('revert');
    expect(row.fail_reason).toBe('drafts failed verify');
    expect(row.attempts).toBe(2);
    expect(row.origin).toBe('recording');
    expect(inboxFromRow(row)).toEqual(item);
  });

  it('maps absent optionals to null and back to undefined', () => {
    const item: InboxItem = {
      id: 'ib-2',
      createdAt: 1787700000000,
      text: 'something to process later',
      status: 'raw',
    };
    const row = inboxRow(item, USER);
    expect(row.kind).toBeNull();
    expect(row.subject).toBeNull();
    expect(row.fix).toBeNull();
    expect(row.fail_reason).toBeNull();
    expect(row.attempts).toBeNull();
    expect(row.origin).toBeNull();
    expect(inboxFromRow(row)).toEqual(item);
  });
});
