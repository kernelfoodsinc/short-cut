// Geometry Engine Tests — Short Cut
// Run: node --test geometry.test.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ============================================
// Extract geometry functions from game
// (copied to keep tests independent of browser)
// ============================================

function rotatePoint(px, py, cx, cy, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = px - cx;
    const dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function lineSegmentIntersection(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return null;
    const ua = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    const ub = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
    if (ua < -1e-6 || ua > 1 + 1e-6 || ub < -1e-6 || ub > 1 + 1e-6) return null;
    return { x: p1.x + ua * d1x, y: p1.y + ua * d1y, ua, ub };
}

function getRectCorners(rect) {
    const hw = rect.w / 2, hh = rect.h / 2;
    const cx = rect.x, cy = rect.y;
    const corners = [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh }
    ];
    if (rect.rotation) {
        return corners.map(c => rotatePoint(c.x, c.y, cx, cy, rect.rotation * Math.PI / 180));
    }
    return corners;
}

function getRectEdges(corners) {
    return [
        [corners[0], corners[1]],
        [corners[1], corners[2]],
        [corners[2], corners[3]],
        [corners[3], corners[0]]
    ];
}

function lineRectIntersection(lineStart, lineEnd, rect) {
    const corners = getRectCorners(rect);
    const edges = getRectEdges(corners);
    const hits = [];
    for (let i = 0; i < edges.length; i++) {
        const hit = lineSegmentIntersection(lineStart, lineEnd, edges[i][0], edges[i][1]);
        if (hit) {
            hit.edgeIndex = i;
            hits.push(hit);
        }
    }
    const unique = [];
    for (const h of hits) {
        let isDup = false;
        for (const u of unique) {
            if (Math.abs(h.x - u.x) < 1 && Math.abs(h.y - u.y) < 1) { isDup = true; break; }
        }
        if (!isDup) unique.push(h);
    }
    unique.sort((a, b) => a.ua - b.ua);
    if (unique.length >= 2) return [unique[0], unique[unique.length - 1]];
    return null;
}

function polygonArea(verts) {
    let area = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += verts[i].x * verts[j].y;
        area -= verts[j].x * verts[i].y;
    }
    return Math.abs(area) / 2;
}

function splitRectangleByLine(rect, entry, exit) {
    const corners = getRectCorners(rect);
    const entryEdge = entry.edgeIndex;
    const exitEdge = exit.edgeIndex;
    if (entryEdge === undefined || exitEdge === undefined || entryEdge === exitEdge) return null;

    const polyA = [{ x: entry.x, y: entry.y }];
    const polyB = [{ x: exit.x, y: exit.y }];

    let i = (entryEdge + 1) % 4;
    while (i !== (exitEdge + 1) % 4) {
        polyA.push({ x: corners[i].x, y: corners[i].y });
        i = (i + 1) % 4;
    }
    polyA.push({ x: exit.x, y: exit.y });

    i = (exitEdge + 1) % 4;
    while (i !== (entryEdge + 1) % 4) {
        polyB.push({ x: corners[i].x, y: corners[i].y });
        i = (i + 1) % 4;
    }
    polyB.push({ x: entry.x, y: entry.y });

    return [polyA, polyB];
}

function calculateCutScore(polyA, polyB, entry, exit, sandwichRotation) {
    const areaA = polygonArea(polyA);
    const areaB = polygonArea(polyB);
    const total = areaA + areaB;
    if (total < 1) return 0;
    const smaller = Math.min(areaA, areaB);
    let rawScore = Math.min((smaller / total) * 2 * 100, 100);

    // Angle penalty: penalize cuts parallel to the sandwich's long axis
    const cutAngle = Math.atan2(exit.y - entry.y, exit.x - entry.x);
    const sandAngle = (sandwichRotation || 0) * Math.PI / 180;
    const angleDiff = cutAngle - sandAngle;
    const perp = Math.abs(Math.sin(angleDiff)); // 1 = perpendicular, 0 = parallel
    const penalty = Math.pow(perp, 0.5); // gentle curve
    rawScore *= (0.5 + 0.5 * penalty); // worst case 50% of raw score

    return Math.min(rawScore, 100);
}

// ============================================
// Helpers
// ============================================

const near = (a, b, tol = 0.5) => Math.abs(a - b) < tol;

// Standard sandwich rect (game defaults)
const SANDWICH = { x: 192, y: 236, w: 160, h: 64, rotation: 0 };

// Full end-to-end: swipe → hits → split → score
function swipeAndScore(rect, startX, startY, endX, endY) {
    const hits = lineRectIntersection({ x: startX, y: startY }, { x: endX, y: endY }, rect);
    if (!hits) return null;
    const polys = splitRectangleByLine(rect, hits[0], hits[1]);
    if (!polys) return null;
    return calculateCutScore(polys[0], polys[1], hits[0], hits[1], rect.rotation);
}

// ============================================
// Tests
// ============================================

describe('lineSegmentIntersection', () => {
    it('returns intersection point for crossing segments', () => {
        const hit = lineSegmentIntersection(
            { x: 0, y: 0 }, { x: 10, y: 10 },
            { x: 10, y: 0 }, { x: 0, y: 10 }
        );
        assert.ok(hit);
        assert.ok(near(hit.x, 5));
        assert.ok(near(hit.y, 5));
    });

    it('returns null for parallel segments', () => {
        const hit = lineSegmentIntersection(
            { x: 0, y: 0 }, { x: 10, y: 0 },
            { x: 0, y: 5 }, { x: 10, y: 5 }
        );
        assert.equal(hit, null);
    });

    it('returns null for collinear non-overlapping segments', () => {
        const hit = lineSegmentIntersection(
            { x: 0, y: 0 }, { x: 5, y: 0 },
            { x: 6, y: 0 }, { x: 10, y: 0 }
        );
        assert.equal(hit, null);
    });

    it('returns null when segments do not reach each other', () => {
        const hit = lineSegmentIntersection(
            { x: 0, y: 0 }, { x: 3, y: 3 },
            { x: 10, y: 0 }, { x: 7, y: 3 }
        );
        assert.equal(hit, null);
    });

    it('detects intersection at segment endpoints (epsilon tolerance)', () => {
        // Line ending exactly at the start of another
        const hit = lineSegmentIntersection(
            { x: 0, y: 5 }, { x: 5, y: 5 },
            { x: 5, y: 0 }, { x: 5, y: 10 }
        );
        assert.ok(hit);
        assert.ok(near(hit.x, 5));
        assert.ok(near(hit.y, 5));
    });

    it('returns correct ua/ub parameters', () => {
        const hit = lineSegmentIntersection(
            { x: 0, y: 5 }, { x: 20, y: 5 },
            { x: 10, y: 0 }, { x: 10, y: 10 }
        );
        assert.ok(hit);
        assert.ok(near(hit.ua, 0.5, 0.01));
        assert.ok(near(hit.ub, 0.5, 0.01));
    });

    it('handles near-zero-length segments gracefully', () => {
        const hit = lineSegmentIntersection(
            { x: 5, y: 5 }, { x: 5.0001, y: 5.0001 },
            { x: 0, y: 0 }, { x: 10, y: 10 }
        );
        // Should not crash — result can be hit or null
        // Just verify no exception
    });

    it('handles perpendicular T-junction', () => {
        const hit = lineSegmentIntersection(
            { x: 5, y: 0 }, { x: 5, y: 10 },
            { x: 0, y: 5 }, { x: 5, y: 5 }
        );
        assert.ok(hit);
        assert.ok(near(hit.x, 5));
        assert.ok(near(hit.y, 5));
    });
});

describe('getRectCorners', () => {
    it('returns 4 axis-aligned corners for unrotated rect', () => {
        const corners = getRectCorners({ x: 100, y: 50, w: 60, h: 40, rotation: 0 });
        assert.equal(corners.length, 4);
        // Top-left
        assert.ok(near(corners[0].x, 70));
        assert.ok(near(corners[0].y, 30));
        // Top-right
        assert.ok(near(corners[1].x, 130));
        assert.ok(near(corners[1].y, 30));
        // Bottom-right
        assert.ok(near(corners[2].x, 130));
        assert.ok(near(corners[2].y, 70));
        // Bottom-left
        assert.ok(near(corners[3].x, 70));
        assert.ok(near(corners[3].y, 70));
    });

    it('rotates corners around center for rotated rect', () => {
        const rect = { x: 100, y: 100, w: 100, h: 0, rotation: 90 };
        const corners = getRectCorners(rect);
        // 100-wide horizontal rect rotated 90° becomes vertical
        // Top-left (50,100) rotated 90° around (100,100) → (100,50)
        assert.ok(near(corners[0].x, 100, 1));
        assert.ok(near(corners[0].y, 50, 1));
    });

    it('returns same corners when rotation is 0 vs undefined', () => {
        const a = getRectCorners({ x: 50, y: 50, w: 20, h: 10, rotation: 0 });
        const b = getRectCorners({ x: 50, y: 50, w: 20, h: 10 });
        for (let i = 0; i < 4; i++) {
            assert.ok(near(a[i].x, b[i].x, 0.01));
            assert.ok(near(a[i].y, b[i].y, 0.01));
        }
    });
});

describe('lineRectIntersection', () => {
    const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
    // Rect spans x:[60,140], y:[80,120]

    it('returns two hits for a line crossing through', () => {
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        assert.ok(hits);
        assert.equal(hits.length, 2);
        assert.ok(near(hits[0].y, 80));
        assert.ok(near(hits[1].y, 120));
    });

    it('returns null for a complete miss', () => {
        const hits = lineRectIntersection(
            { x: 0, y: 0 }, { x: 0, y: 200 }, rect
        );
        assert.equal(hits, null);
    });

    it('returns null for line that ends before reaching rect', () => {
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 50 }, rect
        );
        assert.equal(hits, null);
    });

    it('assigns correct edgeIndex values', () => {
        // Vertical cut through center: enters top edge (0), exits bottom edge (2)
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        assert.ok(hits);
        assert.equal(hits[0].edgeIndex, 0); // top edge
        assert.equal(hits[1].edgeIndex, 2); // bottom edge
    });

    it('handles horizontal cut through rect', () => {
        const hits = lineRectIntersection(
            { x: 0, y: 100 }, { x: 200, y: 100 }, rect
        );
        assert.ok(hits);
        assert.equal(hits[0].edgeIndex, 3); // left edge
        assert.equal(hits[1].edgeIndex, 1); // right edge
    });

    it('handles diagonal cut', () => {
        const hits = lineRectIntersection(
            { x: 50, y: 70 }, { x: 150, y: 130 }, rect
        );
        assert.ok(hits);
        assert.equal(hits.length, 2);
        // Should enter one edge and exit another
        assert.notEqual(hits[0].edgeIndex, hits[1].edgeIndex);
    });

    it('works with rotated rectangles', () => {
        const rotRect = { x: 100, y: 100, w: 80, h: 40, rotation: 45 };
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rotRect
        );
        assert.ok(hits);
        assert.equal(hits.length, 2);
    });

    it('deduplicates corner hits', () => {
        // Line going exactly through a corner
        const hits = lineRectIntersection(
            { x: 0, y: 0 }, { x: 200, y: 200 },
            { x: 100, y: 100, w: 80, h: 40, rotation: 0 }
        );
        // Should still get exactly 2 hits (not 3+ from corner double-count)
        if (hits) {
            assert.equal(hits.length, 2);
        }
    });

    it('handles line clipping just the edge', () => {
        // Line that barely crosses the top-right corner area
        const hits = lineRectIntersection(
            { x: 130, y: 70 }, { x: 150, y: 90 }, rect
        );
        // May or may not hit depending on geometry — just verify no crash
    });
});

describe('polygonArea', () => {
    it('computes area of a unit square', () => {
        const area = polygonArea([
            { x: 0, y: 0 }, { x: 1, y: 0 },
            { x: 1, y: 1 }, { x: 0, y: 1 }
        ]);
        assert.ok(near(area, 1, 0.01));
    });

    it('computes area of a larger rectangle', () => {
        const area = polygonArea([
            { x: 0, y: 0 }, { x: 160, y: 0 },
            { x: 160, y: 64 }, { x: 0, y: 64 }
        ]);
        assert.ok(near(area, 160 * 64, 1));
    });

    it('computes area of a triangle', () => {
        const area = polygonArea([
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }
        ]);
        assert.ok(near(area, 50, 0.01));
    });

    it('returns same area regardless of winding order', () => {
        const cw = polygonArea([
            { x: 0, y: 0 }, { x: 10, y: 0 },
            { x: 10, y: 10 }, { x: 0, y: 10 }
        ]);
        const ccw = polygonArea([
            { x: 0, y: 0 }, { x: 0, y: 10 },
            { x: 10, y: 10 }, { x: 10, y: 0 }
        ]);
        assert.ok(near(cw, ccw, 0.01));
    });

    it('handles degenerate polygon (zero area)', () => {
        const area = polygonArea([
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }
        ]);
        assert.ok(near(area, 0, 0.01));
    });

    it('computes area of irregular pentagon', () => {
        // Known area: compute manually
        const area = polygonArea([
            { x: 0, y: 0 }, { x: 4, y: 0 },
            { x: 5, y: 3 }, { x: 2, y: 5 }, { x: -1, y: 3 }
        ]);
        assert.ok(area > 0);
        assert.ok(near(area, 21, 1));
    });
});

describe('splitRectangleByLine', () => {
    const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
    // Rect spans x:[60,140], y:[80,120]

    it('splits rect into two polygons', () => {
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        assert.ok(polys);
        assert.equal(polys.length, 2);
    });

    it('polygon areas sum to rect area', () => {
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const totalArea = polygonArea(polys[0]) + polygonArea(polys[1]);
        const rectArea = rect.w * rect.h;
        assert.ok(near(totalArea, rectArea, 1));
    });

    it('center vertical cut produces two equal halves', () => {
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const areaA = polygonArea(polys[0]);
        const areaB = polygonArea(polys[1]);
        assert.ok(near(areaA, areaB, 1));
    });

    it('center horizontal cut produces two equal halves', () => {
        const hits = lineRectIntersection(
            { x: 0, y: 100 }, { x: 200, y: 100 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const areaA = polygonArea(polys[0]);
        const areaB = polygonArea(polys[1]);
        assert.ok(near(areaA, areaB, 1));
    });

    it('off-center cut produces unequal halves that still sum correctly', () => {
        // Cut at x=80 (1/4 from left edge of 80-wide rect at x:60-140)
        const hits = lineRectIntersection(
            { x: 80, y: 0 }, { x: 80, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const areaA = polygonArea(polys[0]);
        const areaB = polygonArea(polys[1]);
        const totalArea = areaA + areaB;
        assert.ok(near(totalArea, rect.w * rect.h, 1));
        // Smaller half should be ~1/4 of total
        const smaller = Math.min(areaA, areaB);
        assert.ok(near(smaller, rect.w * rect.h * 0.25, 50));
    });

    it('returns null when entry and exit are on the same edge', () => {
        const entry = { x: 70, y: 80, edgeIndex: 0 };
        const exit = { x: 130, y: 80, edgeIndex: 0 };
        const result = splitRectangleByLine(rect, entry, exit);
        assert.equal(result, null);
    });

    it('returns null when edgeIndex is undefined', () => {
        const result = splitRectangleByLine(rect, { x: 100, y: 80 }, { x: 100, y: 120 });
        assert.equal(result, null);
    });

    it('works with diagonal cuts', () => {
        const hits = lineRectIntersection(
            { x: 50, y: 70 }, { x: 150, y: 130 }, rect
        );
        assert.ok(hits);
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        assert.ok(polys);
        const totalArea = polygonArea(polys[0]) + polygonArea(polys[1]);
        assert.ok(near(totalArea, rect.w * rect.h, 1));
    });

    it('works with rotated rectangles', () => {
        const rotRect = { x: 100, y: 100, w: 80, h: 40, rotation: 30 };
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rotRect
        );
        if (hits) {
            const polys = splitRectangleByLine(rotRect, hits[0], hits[1]);
            if (polys) {
                const totalArea = polygonArea(polys[0]) + polygonArea(polys[1]);
                assert.ok(near(totalArea, rotRect.w * rotRect.h, 2));
            }
        }
    });
});

describe('calculateCutScore', () => {
    it('returns ~100 for a perfect perpendicular center cut', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 0);
        assert.ok(score >= 99, `Expected ~100, got ${score}`);
    });

    it('returns ~50 for a 3:1 perpendicular cut', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
        const hits = lineRectIntersection(
            { x: 80, y: 0 }, { x: 80, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 0);
        assert.ok(score >= 45 && score <= 55, `Expected ~50, got ${score}`);
    });

    it('returns low score for extreme edge cut', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
        const hits = lineRectIntersection(
            { x: 65, y: 0 }, { x: 65, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 0);
        assert.ok(score < 20, `Expected <20 for edge cut, got ${score}`);
    });

    it('returns 0 for degenerate polygons', () => {
        const score = calculateCutScore(
            [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
            [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
            { x: 0, y: 0 }, { x: 0, y: 1 }, 0
        );
        assert.equal(score, 0);
    });

    it('never exceeds 100', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
        const hits = lineRectIntersection(
            { x: 100, y: 0 }, { x: 100, y: 200 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 0);
        assert.ok(score <= 100);
    });

    it('penalizes horizontal cut on non-rotated sandwich', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 0 };
        // Horizontal cut through center (parallel to long axis)
        const hits = lineRectIntersection(
            { x: 0, y: 100 }, { x: 200, y: 100 }, rect
        );
        const polys = splitRectangleByLine(rect, hits[0], hits[1]);
        const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 0);
        // Equal areas but parallel to long axis → heavy penalty
        assert.ok(score < 60, `Expected <60 for lengthwise cut, got ${score}`);
    });

    it('perpendicular cut on rotated sandwich scores high', () => {
        const rect = { x: 100, y: 100, w: 80, h: 40, rotation: 20 };
        const angle = 20 * Math.PI / 180;
        const perpAngle = angle + Math.PI / 2;
        const hits = lineRectIntersection(
            { x: 100 + Math.cos(perpAngle) * 100, y: 100 + Math.sin(perpAngle) * 100 },
            { x: 100 - Math.cos(perpAngle) * 100, y: 100 - Math.sin(perpAngle) * 100 },
            rect
        );
        if (hits) {
            const polys = splitRectangleByLine(rect, hits[0], hits[1]);
            if (polys) {
                const score = calculateCutScore(polys[0], polys[1], hits[0], hits[1], 20);
                assert.ok(score > 85, `Expected >85 for perpendicular cut on rotated sandwich, got ${score}`);
            }
        }
    });
});

describe('end-to-end: swipe → score', () => {
    it('perfect center swipe on game-sized sandwich scores ~100', () => {
        const score = swipeAndScore(SANDWICH, SANDWICH.x, 0, SANDWICH.x, 500);
        assert.ok(score >= 99, `Expected ~100, got ${score}`);
    });

    it('horizontal center swipe penalized (parallel to long axis)', () => {
        const score = swipeAndScore(SANDWICH, 0, SANDWICH.y, 384, SANDWICH.y);
        assert.ok(score < 60, `Expected <60 for lengthwise cut, got ${score}`);
    });

    it('complete miss returns null', () => {
        const score = swipeAndScore(SANDWICH, 0, 0, 10, 10);
        assert.equal(score, null);
    });

    it('short swipe that misses returns null', () => {
        const score = swipeAndScore(SANDWICH, 0, 0, 5, 5);
        assert.equal(score, null);
    });

    it('off-center swipe scores proportionally lower', () => {
        // Cut at 1/4 from left
        const x = SANDWICH.x - SANDWICH.w / 4;
        const score = swipeAndScore(SANDWICH, x, 0, x, 500);
        assert.ok(score !== null);
        assert.ok(score > 40 && score < 60, `Expected 40-60 for 1/4 cut, got ${score}`);
    });

    it('works with offset sandwich (round 2 style)', () => {
        const offsetSandwich = { ...SANDWICH, x: SANDWICH.x + 40 };
        const score = swipeAndScore(offsetSandwich, offsetSandwich.x, 0, offsetSandwich.x, 500);
        assert.ok(score >= 99, `Expected ~100 for center cut on offset, got ${score}`);
    });

    it('works with rotated sandwich (round 3 style)', () => {
        const rotSandwich = { ...SANDWICH, rotation: 18 };
        const score = swipeAndScore(rotSandwich, rotSandwich.x, 0, rotSandwich.x, 500);
        assert.ok(score !== null);
        assert.ok(score > 0);
    });

    it('diagonal swipe through center of rotated sandwich', () => {
        const rotSandwich = { ...SANDWICH, rotation: 20 };
        // Swipe along the sandwich's angle for a center cut
        const angle = 20 * Math.PI / 180;
        const perpAngle = angle + Math.PI / 2;
        const startX = rotSandwich.x + Math.cos(perpAngle) * 100;
        const startY = rotSandwich.y + Math.sin(perpAngle) * 100;
        const endX = rotSandwich.x - Math.cos(perpAngle) * 100;
        const endY = rotSandwich.y - Math.sin(perpAngle) * 100;
        const score = swipeAndScore(rotSandwich, startX, startY, endX, endY);
        assert.ok(score !== null);
        // Perpendicular through center should be near-perfect
        assert.ok(score > 85, `Expected >85 for perpendicular center cut, got ${score}`);
    });

    it('heavily rotated sandwich (45°) still works', () => {
        const rot45 = { ...SANDWICH, rotation: 45 };
        const score = swipeAndScore(rot45, rot45.x, 0, rot45.x, 500);
        assert.ok(score !== null);
        assert.ok(score > 0);
    });

    it('multiple cuts in sequence produce consistent results', () => {
        const scores = [];
        for (let i = 0; i < 10; i++) {
            scores.push(swipeAndScore(SANDWICH, SANDWICH.x, 0, SANDWICH.x, 500));
        }
        // All should be identical (deterministic)
        const first = scores[0];
        for (const s of scores) {
            assert.ok(near(s, first, 0.01));
        }
    });

    it('very slight off-center scores 90+', () => {
        // 2px off center on a 160px wide sandwich
        const score = swipeAndScore(SANDWICH, SANDWICH.x + 2, 0, SANDWICH.x + 2, 500);
        assert.ok(score > 90, `Expected >90 for 2px off-center, got ${score}`);
    });
});
