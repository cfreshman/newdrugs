import {expect,it} from 'vitest';
import review from '../data/dinder/review.json';
import based from '../data/dinder/based-cooking.json';
import {dinderCategory,dinderCategoryFilters} from '../shared/dinderCategories';
import {reviewedDinderMeal} from '../server/dinderReview';
const decisions=new Map(review.items.map(row=>[row.id,row]));
it('records an individual decision for all 945 recipes, including every added photographed recipe',()=>{
 expect(review.reviewedCount).toBe(945);expect(decisions.size).toBe(945);expect(review.items.every(row=>typeof row.approved==='boolean')).toBe(true);
 expect(review.items.filter(row=>row.approved)).toHaveLength(review.approvedCount);for(const meal of based.meals)expect(decisions.has(meal.id)).toBe(true);
});
it('keeps familiar-base meal sauces and quick drinks while removing pizza sauce, dressings and raw dough',()=>{
 for(const id of ['based:bolognese-sauce','based:fume-sauce','based:ragu-napoletano','based:assam-tea','based:blueberry-smoothie'])expect(decisions.get(id)?.approved).toBe(true);
 for(const id of ['based:easy-pizza-sauce','based:burger-dressing','based:mayonnaise-or-aioli','based:wholemeal-wheat-flour-pizza-dough'])expect(decisions.get(id)?.approved).toBe(false);
 expect(decisions.get('based:wholemeal-pizza')?.approved).toBe(true);expect(decisions.get('based:pan-pizza')?.approved).toBe(true);
});
it('distinguishes mandatory advance preparation from optional overnight improvements',()=>{
 for(const id of ['based:no-knead-bread','based:sourdough-loaf','based:limoncello','based:sauerkraut','53303'])expect(decisions.get(id)?.approved).toBe(false);
 for(const id of ['53262','53568','based:ceviche','based:hummus','53175'])expect(decisions.get(id)?.approved).toBe(true);
});
it('merges legacy source categories and exclusions without leaving duplicate filters',()=>{
 expect(dinderCategoryFilters(['Chicken','turkey','Lamb','Goat','Side','Starter','Dessert','Pasta','Miscellaneous'])).toEqual(['Poultry','Lamb & goat','Sides & starters','Desserts','Pasta & noodles','Other']);
 expect(dinderCategory('Fish')).toBe('Seafood');expect(decisions.get('based:two-ingredient-pancakes')?.category).toBe('Desserts');expect(decisions.get('53000')?.category).toBe('Vegetarian');
});
it('does not automatically approve an unreviewed recipe from a later source import',()=>{
 expect(reviewedDinderMeal({...based.meals[0],id:'future-new-recipe'}).catalogApproved).toBe(false);
});
