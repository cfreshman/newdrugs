import {useContext,type AnchorHTMLAttributes,type MouseEvent} from 'react';
import {destinationPath,type Destination} from '../shared/navigation';
import {NavigationContext} from './NavigationContext';

export function plainLinkClick(event:Pick<MouseEvent<HTMLAnchorElement>,'button'|'metaKey'|'ctrlKey'|'shiftKey'|'altKey'>){return event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey;}

export function NavLink({to,navigate:override,onClick,children,...props}:Omit<AnchorHTMLAttributes<HTMLAnchorElement>,'href'>&{to:Destination;navigate?:(destination:Destination)=>void}){
 const inherited=useContext(NavigationContext),navigate=override||inherited;
 return <a {...props} data-nav-link="" href={destinationPath(to)} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&navigate&&plainLinkClick(event)){event.preventDefault();navigate(to);}}}>{children}</a>;
}
