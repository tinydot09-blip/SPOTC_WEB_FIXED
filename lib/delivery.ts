import type{CartItem}from'./cart';
export type BusinessCartGroup={key:string;businessId:string;businessName:string;items:CartItem[];subtotal:number;delivery:number;totalQuantity:number};
export const DELIVERY_PER_SHOP=20;
export function groupCartByBusiness(items:CartItem[]):BusinessCartGroup[]{const map=new Map<string,BusinessCartGroup>();for(const item of items){const key=item.businessId?.trim()||item.businessName?.trim().toLowerCase()||'spotc-shop';const group=map.get(key)??{key,businessId:item.businessId?.trim()||'',businessName:item.businessName?.trim()||'SPOTC Shop',items:[],subtotal:0,delivery:DELIVERY_PER_SHOP,totalQuantity:0};group.items.push(item);group.subtotal+=item.price*item.qty;group.totalQuantity+=item.qty;map.set(key,group)}return[...map.values()]}
export const cartSubtotal=(items:CartItem[])=>items.reduce((s,x)=>s+x.price*x.qty,0);
export const cartDelivery=(items:CartItem[])=>items.length?groupCartByBusiness(items).length*DELIVERY_PER_SHOP:0;
