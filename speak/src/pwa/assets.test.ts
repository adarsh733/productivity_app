import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA & Describe Mode Asset Integrity', () => {
  const publicDir = path.resolve(__dirname, '../../public');
  const seedFile = path.resolve(__dirname, '../content/seed/21-describe.json');

  it('contains all required PWA manifest icons', () => {
    const requiredManifestIcons = ['icon.svg', 'icon-192.png', 'icon-512.png'];
    for (const icon of requiredManifestIcons) {
      const fullPath = path.join(publicDir, icon);
      expect(fs.existsSync(fullPath), `Missing manifest icon: ${icon}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('contains all Describe card image assets referenced in seed content', () => {
    expect(fs.existsSync(seedFile), 'Describe seed content file exists').toBe(true);
    const content = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as Array<{ imagePath: string }>;
    expect(content.length).toBeGreaterThan(0);

    const imageCards = content.filter((c) => Boolean(c.imagePath && c.imagePath.trim() !== ''));
    expect(imageCards.length).toBeGreaterThan(0);

    for (const card of imageCards) {
      // Remove leading slash to resolve relative to public/
      const cleanPath = card.imagePath.replace(/^\//, '');
      const assetPath = path.join(publicDir, cleanPath);
      expect(fs.existsSync(assetPath), `Missing Describe image asset: ${card.imagePath}`).toBe(true);
      const stat = fs.statSync(assetPath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });
});
