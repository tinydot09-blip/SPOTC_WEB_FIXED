import Link from 'next/link';

const cards = [
  ['Products', 'Manage catalogue, stock, media and inventory locations.', '/admin/products'],
  ['Offers', 'Upload offer videos and link products.', '/admin/offers'],
  ['Orders', 'Pick, pack and manage customer orders.', '/admin/orders'],
  ['Users', 'Find customers and review account information.', '/admin/users'],
  ['Reports', 'Sales, stock and operating reports.', '/admin/reports'],
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 style={{margin:'0 0 8px',fontSize:32}}>Dashboard</h1>
      <p style={{margin:'0 0 24px',color:'#666'}}>SPOTC catalogue and operations control center.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
        {cards.map(([title, text, href]) => (
          <Link key={href} href={href} style={{textDecoration:'none',color:'inherit',background:'white',border:'1px solid #e8e8e8',borderRadius:18,padding:20}}>
            <div style={{fontSize:20,fontWeight:900,marginBottom:8}}>{title}</div>
            <div style={{color:'#666',lineHeight:1.5}}>{text}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
