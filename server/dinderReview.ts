import review from '../data/dinder/review.json';
import {dinderCategory} from '../shared/dinderCategories';
import type {Meal} from '../shared/dinder';

const decisions=new Map(review.items.map(item=>[item.id,item]));
export const DINDER_REVIEW_VERSION=review.revision;
export const dinderReviewedCategory=(id:string,category:string)=>decisions.get(id)?.category||dinderCategory(category);
export function reviewedDinderMeal(meal:Meal){
 const decision=decisions.get(meal.id);
 return {...meal,category:dinderReviewedCategory(meal.id,meal.category),catalogApproved:decision?.approved===true,catalogReviewVersion:DINDER_REVIEW_VERSION,...(decision?.approved!==true?{catalogReviewReason:decision&&'reason' in decision?decision.reason:'Awaiting individual recipe review.'}:{catalogReviewReason:null})};
}
