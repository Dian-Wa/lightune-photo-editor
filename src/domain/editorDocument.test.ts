import { describe, expect, it } from 'vitest';
import { createDocument, commitDocument, initialHistory, moveHistory, rotateComposition, flipComposition, transformedSize, straightenScale } from './editorDocument';
describe('unified document editing', () => {
  it('undoes recipes and composition together, drops redo and limits history', () => {
    const doc = createDocument();
    let history = initialHistory(doc);
    history = commitDocument(history, { ...doc, recipe: { ...doc.recipe, brightness: 25 } }, '亮度');
    history = commitDocument(history, { ...history.entries[1].document, composition: rotateComposition(doc.composition, 1) }, '旋转');
    history = moveHistory(history, -1);
    expect(history.entries[history.cursor].document.recipe.brightness).toBe(25);
    expect(history.entries[history.cursor].document.composition.rotation).toBe(0);
    history = commitDocument(history, doc, '重置');
    expect(history.entries).toHaveLength(3);
    for(let i=0;i<80;i++) history = commitDocument(history, {...doc, recipe:{...doc.recipe,brightness:i}},'亮度');
    expect(history.entries).toHaveLength(60);
  });
  it('rotates and mirrors the same selected image region', () => {
    const composition = {...createDocument().composition, crop:{x:0.1,y:0.2,width:0.3,height:0.4}};
    const rotated = rotateComposition(composition,1);
    expect(rotated.crop.x).toBeCloseTo(0.4);
    expect(rotated.crop.y).toBeCloseTo(0.1);
    expect(rotated.crop.width).toBeCloseTo(0.4);
    expect(flipComposition(composition,'x').crop.x).toBeCloseTo(0.6);
    expect(transformedSize(1200,800,rotated)).toEqual({width:800,height:1200});
  });
  it('uses a safe zoom for straightening both portrait and landscape', () => {
    for(const [w,h] of [[1200,800],[800,1200]]) for(const angle of [-45,0,18,45]) {
      const scale = straightenScale(w,h,angle);
      const radians = Math.abs(angle)*Math.PI/180;
      expect((Math.cos(radians)*w+Math.sin(radians)*h)/scale).toBeLessThanOrEqual(w+0.001);
      expect((Math.sin(radians)*w+Math.cos(radians)*h)/scale).toBeLessThanOrEqual(h+0.001);
    }
  });
});
