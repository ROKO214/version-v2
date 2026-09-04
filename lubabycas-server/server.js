require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const os      = require('os');
const path    = require('path');
const { db, stockOf, stock2daOf, nowStr, genId } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family==='IPv4' && !net.internal) return net.address;
  return 'localhost';
}

app.use(cors({origin:'*'}));
app.use(express.json({limit:'50mb'}));
app.use((req,res,next)=>{res.setHeader('ngrok-skip-browser-warning','true');next();});
app.use(express.static(path.join(__dirname,'..','lubabycas')));

function addAudit(user,role,action,sku,sn,detail) {
  db.prepare('INSERT INTO audit (time,user,role,action,sku,sn,detail) VALUES (?,?,?,?,?,?,?)')
    .run(nowStr(),user||'—',role||'—',action,sku||'—',sn||'—',detail||'');
}

// ── AUTH ──────────────────────────────────
app.post('/api/auth/login',(req,res)=>{
  const {username,password}=req.body;
  const u=db.prepare('SELECT * FROM usuarios WHERE username=? AND password=?').get(username,password);
  if(!u) return res.status(401).json({error:'Credenciales incorrectas'});
  db.prepare('UPDATE usuarios SET lastLogin=? WHERE id=?').run(nowStr(),u.id);
  addAudit(u.name,u.role,'Login','—','—','');
  res.json({ok:true,user:{...u,perms:JSON.parse(u.perms),password:undefined}});
});

// ── USUARIOS ──────────────────────────────
app.get('/api/users',(req,res)=>{
  res.json(db.prepare('SELECT id,username,name,role,perms,lastLogin FROM usuarios').all().map(u=>({...u,perms:JSON.parse(u.perms)})));
});
app.post('/api/users',(req,res)=>{
  const {username,name,password,role}=req.body;
  if(!username||!name||!password||!role) return res.status(400).json({error:'Faltan campos'});
  const P={admin:['read','write','edit','delete','users','export'],supervisor:['read','write','edit','export'],bodeguero:['read','write','edit'],lectura:['read']};
  try{ db.prepare('INSERT INTO usuarios (username,name,password,role,perms) VALUES (?,?,?,?,?)').run(username,name,password,role,JSON.stringify(P[role]||['read'])); res.status(201).json({ok:true}); }
  catch(e){ res.status(409).json({error:'Usuario ya existe'}); }
});
app.delete('/api/users/:id',(req,res)=>{ db.prepare('DELETE FROM usuarios WHERE id=?').run(+req.params.id); res.json({ok:true}); });

// ── PRODUCTOS ─────────────────────────────
app.get('/api/products',(req,res)=>{
  const {q,filter}=req.query;
  let sql='SELECT * FROM products WHERE 1=1'; const p=[];
  if(q){sql+=' AND (sku LIKE ? OR name LIKE ? OR brand LIKE ? OR barcode1 LIKE ? OR barcode2 LIKE ?)';const lq='%'+q+'%';p.push(lq,lq,lq,lq,lq);}
  let list=db.prepare(sql).all(...p).map(x=>({...x,stock:stockOf(x.sku),stock2da:stock2daOf(x.sku),snCount:db.prepare('SELECT COUNT(*) as n FROM seriales WHERE sku=?').get(x.sku).n}));
  if(filter==='low')  list=list.filter(x=>x.stock<=(x.stockMin||0)&&x.stockMin>0);
  if(filter==='zero') list=list.filter(x=>x.stock===0);
  res.json(list);
});
app.get('/api/products/:code',(req,res)=>{
  const c=req.params.code;
  const p=db.prepare('SELECT * FROM products WHERE sku=? OR barcode1=? OR barcode2=?').get(c,c,c);
  if(!p) return res.status(404).json({error:'No encontrado'});
  res.json({...p,stock:stockOf(p.sku),stock2da:stock2daOf(p.sku)});
});
app.post('/api/products',(req,res)=>{
  const {sku,name,brand,cat,barcode1,barcode2,stockMin,ubicacion,notes,createdBy}=req.body;
  if(!sku||!name) return res.status(400).json({error:'SKU y nombre obligatorios'});
  const id=genId('P');
  const bc2=barcode2||'BOD-'+String(db.prepare('SELECT COUNT(*) as n FROM products').get().n+1).padStart(4,'0');
  try{
    db.prepare('INSERT INTO products (id,sku,name,brand,cat,barcode1,barcode2,stockMin,ubicacion,notes,createdBy) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,sku.toUpperCase(),name,brand||'',cat||'',barcode1||'',bc2,+stockMin||0,ubicacion||'',notes||'',createdBy||'Sistema');
    addAudit(createdBy,'—','SKU creado',sku,'—',name);
    res.status(201).json({id,sku:sku.toUpperCase(),name,stock:0,stock2da:0});
  }catch(e){res.status(409).json({error:'SKU ya existe'});}
});
app.put('/api/products/:sku',(req,res)=>{
  const {name,brand,cat,barcode1,barcode2,stockMin,ubicacion,notes,editedBy}=req.body;
  db.prepare('UPDATE products SET name=COALESCE(?,name),brand=COALESCE(?,brand),cat=COALESCE(?,cat),barcode1=COALESCE(?,barcode1),barcode2=COALESCE(?,barcode2),stockMin=COALESCE(?,stockMin),ubicacion=COALESCE(?,ubicacion),notes=COALESCE(?,notes),updatedAt=? WHERE sku=?').run(name,brand,cat,barcode1,barcode2,stockMin,ubicacion,notes,nowStr(),req.params.sku);
  res.json({ok:true});
});
app.delete('/api/products/:sku',(req,res)=>{
  const sku = decodeURIComponent(req.params.sku);
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM segunda_movimientos WHERE itemId IN (SELECT id FROM segunda_seleccion WHERE sku=?)').run(sku);
      db.prepare('DELETE FROM segunda_seleccion WHERE sku=?').run(sku);
      db.prepare('DELETE FROM devolucion_historial WHERE devolucionId IN (SELECT id FROM devoluciones WHERE sku=?)').run(sku);
      db.prepare('DELETE FROM devoluciones WHERE sku=?').run(sku);
      db.prepare('DELETE FROM movimientos WHERE sku=?').run(sku);
      db.prepare('DELETE FROM seriales WHERE sku=?').run(sku);
      db.prepare('DELETE FROM products WHERE sku=?').run(sku);
    })();
    addAudit('Sistema','admin','SKU eliminado',sku,'—','Eliminación completa');
    res.json({ok:true});
  } catch(e) {
    console.error('Error eliminando SKU:', e.message);
    res.status(500).json({error: e.message});
  }
});

// ── SERIALES ──────────────────────────────
app.get('/api/seriales',(req,res)=>{
  const {sku,sn,estado}=req.query;
  let sql='SELECT * FROM seriales WHERE 1=1';const p=[];
  if(sku){sql+=' AND sku=?';p.push(sku);}
  if(sn){sql+=' AND sn=?';p.push(sn);}
  if(estado){sql+=' AND estado=?';p.push(estado);}
  res.json(db.prepare(sql).all(...p));
});
app.get('/api/seriales/:sn',(req,res)=>{
  const s=db.prepare('SELECT * FROM seriales WHERE sn=?').get(req.params.sn);
  if(!s) return res.status(404).json({error:'No encontrado'});
  res.json(s);
});

// ── MOVIMIENTOS ───────────────────────────
app.get('/api/movimientos',(req,res)=>{
  const {sku,tipo,sn}=req.query;
  let sql='SELECT * FROM movimientos WHERE 1=1';const p=[];
  if(sku){sql+=' AND sku=?';p.push(sku);}
  if(tipo){sql+=' AND tipo=?';p.push(tipo);}
  if(sn){sql+=' AND sn=?';p.push(sn);}
  res.json(db.prepare(sql+' ORDER BY date DESC').all(...p));
});

app.post('/api/movimientos/ingreso',(req,res)=>{
  const {sku,sns,factura,proveedor,fecha,notes,user,userRole}=req.body;
  if(!sku||!sns?.length||!factura) return res.status(400).json({error:'Faltan campos'});
  if(!db.prepare('SELECT id FROM products WHERE sku=?').get(sku)) return res.status(404).json({error:'SKU no encontrado'});
  const dups=sns.filter(sn=>db.prepare('SELECT id FROM seriales WHERE sn=?').get(sn));
  if(dups.length) return res.status(409).json({error:'S/N '+dups[0]+' ya existe'});
  const ds=(fecha?new Date(fecha).toLocaleDateString('es-CL'):new Date().toLocaleDateString('es-CL'))+' '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  const iSN=db.prepare('INSERT INTO seriales (id,sku,sn,estado,ingresoDate,factura,proveedor,userIngreso) VALUES (?,?,?,?,?,?,?,?)');
  const iMov=db.prepare('INSERT INTO movimientos (id,tipo,sku,sn,factura,proveedor,user,date,notes) VALUES (?,?,?,?,?,?,?,?,?)');
  db.transaction(list=>{list.forEach(sn=>{iSN.run(genId('S'),sku,sn,'disponible',ds,factura,proveedor||'',user||'Sistema');iMov.run(genId('M'),'ingreso',sku,sn,factura,proveedor||'',user||'Sistema',ds,notes||'');addAudit(user,userRole,'Ingreso',sku,sn,'Fact:'+factura);});})(sns);
  res.status(201).json({ok:true,count:sns.length,stockActual:stockOf(sku)});
});

app.post('/api/movimientos/salida',(req,res)=>{
  const {sku,sns,docSalida,tipoDet,notes,user,userRole}=req.body;
  if(!sku||!sns?.length) return res.status(400).json({error:'Faltan campos'});
  const errs=sns.filter(sn=>{const s=db.prepare('SELECT * FROM seriales WHERE sn=? AND sku=?').get(sn,sku);return !s||s.estado!=='disponible';});
  if(errs.length) return res.status(409).json({error:'S/N '+errs[0]+' no disponible'});
  const ds=nowStr();
  const uSN=db.prepare('UPDATE seriales SET estado=?,salidaDate=?,docSalida=?,userSalida=? WHERE sn=?');
  const iMov=db.prepare('INSERT INTO movimientos (id,tipo,tipoDet,sku,sn,docSalida,user,date,notes) VALUES (?,?,?,?,?,?,?,?,?)');
  db.transaction(list=>{list.forEach(sn=>{uSN.run('vendido',ds,docSalida||'',user||'Sistema',sn);iMov.run(genId('M'),'salida',tipoDet||'manual',sku,sn,docSalida||'',user||'Sistema',ds,notes||'');addAudit(user,userRole,'Salida',sku,sn,'Doc:'+(docSalida||'—'));});})(sns);
  res.json({ok:true,count:sns.length,stockActual:stockOf(sku)});
});

// ── DEVOLUCIONES ──────────────────────────
app.get('/api/devoluciones',(req,res)=>{
  const {estado,sku,q}=req.query;
  let sql='SELECT d.*,p.name as productName FROM devoluciones d LEFT JOIN products p ON d.sku=p.sku WHERE 1=1';const params=[];
  if(estado){sql+=' AND d.estado=?';params.push(estado);}
  if(sku){sql+=' AND d.sku=?';params.push(sku);}
  if(q){sql+=' AND (d.sku LIKE ? OR d.sn LIKE ? OR d.motivo LIKE ? OR p.name LIKE ?)';const lq='%'+q+'%';params.push(lq,lq,lq,lq);}
  res.json(db.prepare(sql+' ORDER BY d.fechaIngreso DESC').all(...params));
});

app.get('/api/devoluciones/stats',(req,res)=>{
  res.json(db.prepare("SELECT COUNT(*) as total,SUM(CASE WHEN estado='en_revision' THEN 1 ELSE 0 END) as en_revision,SUM(CASE WHEN estado='reparado' THEN 1 ELSE 0 END) as reparado,SUM(CASE WHEN estado='listo' THEN 1 ELSE 0 END) as listo,SUM(CASE WHEN estado='merma' THEN 1 ELSE 0 END) as merma,SUM(CASE WHEN estado='segunda' THEN 1 ELSE 0 END) as segunda FROM devoluciones").get());
});

app.get('/api/devoluciones/:id',(req,res)=>{
  const d=db.prepare('SELECT d.*,p.name as productName FROM devoluciones d LEFT JOIN products p ON d.sku=p.sku WHERE d.id=?').get(req.params.id);
  if(!d) return res.status(404).json({error:'No encontrada'});
  const h=db.prepare('SELECT * FROM devolucion_historial WHERE devolucionId=? ORDER BY date ASC').all(req.params.id);
  res.json({...d,historial:h});
});

app.post('/api/devoluciones',(req,res)=>{
  const {sku,sn,motivo,observacion,docOrigen,imagenes,user,userRole}=req.body;
  if(!sku||!motivo) return res.status(400).json({error:'SKU y motivo obligatorios'});
  if(!db.prepare('SELECT id FROM products WHERE sku=?').get(sku)) return res.status(404).json({error:'SKU no encontrado'});
  const id=genId('DEV');const ds=nowStr();
  db.prepare('INSERT INTO devoluciones (id,sku,sn,motivo,estado,observacion,docOrigen,imagenes,fechaIngreso,userIngreso) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,sku,sn||'',motivo,'en_revision',observacion||'',docOrigen||'',JSON.stringify(imagenes||[]),ds,user||'Sistema');
  db.prepare('INSERT INTO devolucion_historial (devolucionId,estadoAnterior,estadoNuevo,observacion,user,date) VALUES (?,?,?,?,?,?)').run(id,null,'en_revision','Devolución creada: '+motivo,user||'Sistema',ds);
  if(sn&&db.prepare('SELECT id FROM seriales WHERE sn=?').get(sn)) db.prepare("UPDATE seriales SET estado='reservado' WHERE sn=?").run(sn);
  addAudit(user,userRole,'Devolución creada',sku,sn||'—','Motivo:'+motivo);
  res.status(201).json({ok:true,id});
});

app.put('/api/devoluciones/:id',(req,res)=>{
  const {estado,observacion,imagenes,user,userRole}=req.body;
  const VALID=['en_revision','reparado','listo','merma','segunda'];
  if(!VALID.includes(estado)) return res.status(400).json({error:'Estado inválido'});
  const d=db.prepare('SELECT * FROM devoluciones WHERE id=?').get(req.params.id);
  if(!d) return res.status(404).json({error:'No encontrada'});
  const ds=nowStr();
  const imgs=imagenes?JSON.stringify(imagenes):d.imagenes;
  db.prepare('UPDATE devoluciones SET estado=?,observacion=?,imagenes=?,fechaEstado=?,userEstado=?,destinoFinal=? WHERE id=?').run(estado,observacion||d.observacion,imgs,ds,user||'Sistema',estado==='merma'||estado==='listo'||estado==='segunda'?estado:'',req.params.id);
  db.prepare('INSERT INTO devolucion_historial (devolucionId,estadoAnterior,estadoNuevo,observacion,user,date) VALUES (?,?,?,?,?,?)').run(req.params.id,d.estado,estado,observacion||'',user||'Sistema',ds);
  if(d.sn){
    if(estado==='listo')   db.prepare("UPDATE seriales SET estado='disponible' WHERE sn=?").run(d.sn);
    if(estado==='merma')   db.prepare("UPDATE seriales SET estado='vendido'    WHERE sn=?").run(d.sn);
    if(estado==='segunda') db.prepare("UPDATE seriales SET estado='reservado'  WHERE sn=?").run(d.sn);
  }
  addAudit(user,userRole,'Devolución→'+estado,d.sku,d.sn||'—',observacion||'');
  const updated=db.prepare('SELECT * FROM devoluciones WHERE id=?').get(req.params.id);
  const hist=db.prepare('SELECT * FROM devolucion_historial WHERE devolucionId=? ORDER BY date ASC').all(req.params.id);
  res.json({...updated,historial:hist});
});

// ══════════════════════════════════════════
//  SEGUNDA SELECCIÓN
// ══════════════════════════════════════════

app.delete('/api/devoluciones/:id',(req,res)=>{
  try {
    db.transaction(()=>{
      db.prepare('DELETE FROM devolucion_historial WHERE devolucionId=?').run(req.params.id);
      db.prepare('DELETE FROM devoluciones WHERE id=?').run(req.params.id);
    })();
    addAudit('Sistema','—','Devolución eliminada','—','—',req.params.id);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/segunda',(req,res)=>{
  const {estado,sku,q}=req.query;
  let sql='SELECT s.*,p.name as skuName FROM segunda_seleccion s LEFT JOIN products p ON s.sku=p.sku WHERE 1=1';const params=[];
  if(estado){sql+=' AND s.estado=?';params.push(estado);}
  if(sku){sql+=' AND s.sku=?';params.push(sku);}
  if(q){sql+=' AND (s.sku LIKE ? OR s.nombre LIKE ? OR s.descripcion LIKE ? OR s.sn LIKE ?)';const lq='%'+q+'%';params.push(lq,lq,lq,lq);}
  const list=db.prepare(sql+' ORDER BY s.fechaIngreso DESC').all(...params);
  res.json(list.map(x=>({...x,imagenes:JSON.parse(x.imagenes||'[]')})));
});

app.get('/api/segunda/stats',(req,res)=>{
  res.json(db.prepare("SELECT COUNT(*) as total,SUM(CASE WHEN estado='disponible' THEN 1 ELSE 0 END) as disponible,SUM(CASE WHEN estado='vendido' THEN 1 ELSE 0 END) as vendido,SUM(CASE WHEN estado='merma' THEN 1 ELSE 0 END) as merma,COALESCE(SUM(CASE WHEN estado='disponible' THEN precioVenta ELSE 0 END),0) as valorStock FROM segunda_seleccion").get());
});

app.get('/api/segunda/:id',(req,res)=>{
  const s=db.prepare('SELECT s.*,p.name as skuName FROM segunda_seleccion s LEFT JOIN products p ON s.sku=p.sku WHERE s.id=?').get(req.params.id);
  if(!s) return res.status(404).json({error:'No encontrado'});
  const movs=db.prepare('SELECT * FROM segunda_movimientos WHERE itemId=? ORDER BY date DESC').all(req.params.id);
  res.json({...s,imagenes:JSON.parse(s.imagenes||'[]'),movimientos:movs});
});

app.post('/api/segunda',(req,res)=>{
  const {sku,sn,nombre,descripcion,estadoFisico,precioOriginal,precioVenta,imagenes,devolucionOrigen,notas,user,userRole}=req.body;
  if(!sku||!nombre) return res.status(400).json({error:'SKU y nombre obligatorios'});
  const id=genId('SS');const ds=nowStr();
  db.prepare('INSERT INTO segunda_seleccion (id,sku,sn,nombre,descripcion,estadoFisico,precioOriginal,precioVenta,imagenes,estado,devolucionOrigen,fechaIngreso,userIngreso,notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sku,sn||'',nombre,descripcion||'',estadoFisico||'bueno',+precioOriginal||0,+precioVenta||0,JSON.stringify(imagenes||[]),'disponible',devolucionOrigen||'',ds,user||'Sistema',notas||'');
  db.prepare('INSERT INTO segunda_movimientos (id,tipo,itemId,sku,sn,precio,user,date,notes) VALUES (?,?,?,?,?,?,?,?,?)').run(genId('SM'),'ingreso',id,sku,sn||'',+precioVenta||0,user||'Sistema',ds,'Ingreso a segunda selección');
  addAudit(user,userRole,'2da selección ingreso',sku,sn||'—','Precio:'+precioVenta);
  res.status(201).json({ok:true,id});
});

app.put('/api/segunda/:id',(req,res)=>{
  const {descripcion,estadoFisico,precioVenta,imagenes,notas,user}=req.body;
  const item=db.prepare('SELECT * FROM segunda_seleccion WHERE id=?').get(req.params.id);
  if(!item) return res.status(404).json({error:'No encontrado'});
  const imgs=imagenes?JSON.stringify(imagenes):item.imagenes;
  db.prepare('UPDATE segunda_seleccion SET descripcion=COALESCE(?,descripcion),estadoFisico=COALESCE(?,estadoFisico),precioVenta=COALESCE(?,precioVenta),imagenes=?,notas=COALESCE(?,notas) WHERE id=?').run(descripcion,estadoFisico,precioVenta?+precioVenta:null,imgs,notas,req.params.id);
  res.json({ok:true});
});

app.post('/api/segunda/:id/vender',(req,res)=>{
  const {docSalida,precio,notes,user,userRole}=req.body;
  const item=db.prepare('SELECT * FROM segunda_seleccion WHERE id=?').get(req.params.id);
  if(!item) return res.status(404).json({error:'No encontrado'});
  if(item.estado!=='disponible') return res.status(409).json({error:'Item no disponible'});
  const ds=nowStr();
  db.prepare('UPDATE segunda_seleccion SET estado=?,fechaSalida=?,docSalida=?,userSalida=? WHERE id=?').run('vendido',ds,docSalida||'',user||'Sistema',req.params.id);
  db.prepare('INSERT INTO segunda_movimientos (id,tipo,itemId,sku,sn,docSalida,precio,user,date,notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(genId('SM'),'venta',req.params.id,item.sku,item.sn,docSalida||'',+precio||item.precioVenta,user||'Sistema',ds,notes||'');
  if(item.sn) db.prepare("UPDATE seriales SET estado='vendido',salidaDate=?,docSalida=? WHERE sn=?").run(ds,docSalida||'',item.sn);
  addAudit(user,userRole,'2da selección venta',item.sku,item.sn||'—','Doc:'+(docSalida||'—'));
  res.json({ok:true});
});

app.post('/api/segunda/:id/merma',(req,res)=>{
  const {motivo,user,userRole}=req.body;
  const item=db.prepare('SELECT * FROM segunda_seleccion WHERE id=?').get(req.params.id);
  if(!item) return res.status(404).json({error:'No encontrado'});
  db.prepare("UPDATE segunda_seleccion SET estado='merma',fechaSalida=?,notas=? WHERE id=?").run(nowStr(),(item.notas?item.notas+' | ':'')+('Merma: '+motivo),req.params.id);
  if(item.sn) db.prepare("UPDATE seriales SET estado='vendido' WHERE sn=?").run(item.sn);
  addAudit(user,userRole,'2da selección merma',item.sku,item.sn||'—',motivo||'');
  res.json({ok:true});
});

app.delete('/api/segunda/:id',(req,res)=>{
  try {
    db.transaction(()=>{
      db.prepare('DELETE FROM segunda_movimientos WHERE itemId=?').run(req.params.id);
      db.prepare('DELETE FROM segunda_seleccion WHERE id=?').run(req.params.id);
    })();
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── DELETE SERIAL ─────────────────────────
app.delete('/api/seriales/:sn',(req,res)=>{
  const sn = decodeURIComponent(req.params.sn);
  try {
    db.transaction(()=>{
      db.prepare('DELETE FROM movimientos WHERE sn=?').run(sn);
      db.prepare('DELETE FROM seriales WHERE sn=?').run(sn);
    })();
    addAudit('Sistema','—','S/N eliminado','—',sn,'');
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── DELETE MOVIMIENTO ──────────────────────
app.delete('/api/movimientos/:id',(req,res)=>{
  db.prepare('DELETE FROM movimientos WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── PATCH USER TOGGLE ──────────────────────
app.patch('/api/users/:id/toggle',(req,res)=>{
  const {activo} = req.body;
  db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(activo?1:0, +req.params.id);
  res.json({ok:true});
});

// ── PUT USER ───────────────────────────────
app.put('/api/users/:id',(req,res)=>{
  const {name,role,password,activo} = req.body;
  const P={admin:['read','write','edit','delete','users','export'],supervisor:['read','write','edit','export'],bodeguero:['read','write','edit'],lectura:['read']};
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(+req.params.id);
  if(!u) return res.status(404).json({error:'No encontrado'});
  db.prepare('UPDATE usuarios SET name=COALESCE(?,name),role=COALESCE(?,role),perms=COALESCE(?,perms),activo=COALESCE(?,activo)'+(password?',password=?':'')+' WHERE id=?')
    .run(name||null, role||null, role?JSON.stringify(P[role]):null, activo!==undefined?(activo?1:0):null, ...(password?[password]:[]), +req.params.id);
  res.json({ok:true});
});

// ── TRAZABILIDAD ──────────────────────────
app.get('/api/trazabilidad/:query',(req,res)=>{
  const q=req.params.query;
  const serial=db.prepare('SELECT * FROM seriales WHERE sn=?').get(q);
  if(serial){
    const prod=db.prepare('SELECT * FROM products WHERE sku=?').get(serial.sku);
    const movs=db.prepare('SELECT * FROM movimientos WHERE sn=? ORDER BY date DESC').all(q);
    const devs=db.prepare('SELECT * FROM devoluciones WHERE sn=? ORDER BY fechaIngreso DESC').all(q);
    const seg=db.prepare('SELECT * FROM segunda_seleccion WHERE sn=?').get(q);
    return res.json({tipo:'sn',serial,producto:prod||null,movimientos:movs,devoluciones:devs,segunda:seg||null});
  }
  const prod=db.prepare('SELECT * FROM products WHERE sku=? OR barcode1=? OR barcode2=?').get(q,q,q);
  if(prod){
    const sns=db.prepare('SELECT * FROM seriales WHERE sku=?').all(prod.sku);
    const movs=db.prepare('SELECT * FROM movimientos WHERE sku=? ORDER BY date DESC').all(prod.sku);
    const devs=db.prepare('SELECT * FROM devoluciones WHERE sku=? ORDER BY fechaIngreso DESC').all(prod.sku);
    const seg=db.prepare('SELECT * FROM segunda_seleccion WHERE sku=? ORDER BY fechaIngreso DESC').all(prod.sku);
    return res.json({tipo:'sku',producto:prod,seriales:sns,movimientos:movs,devoluciones:devs,segunda:seg,stock:stockOf(prod.sku),stock2da:stock2daOf(prod.sku)});
  }
  const movsFac=db.prepare('SELECT * FROM movimientos WHERE factura=? OR docSalida=? ORDER BY date DESC').all(q,q);
  if(movsFac.length) return res.json({tipo:'documento',documento:q,movimientos:movsFac});
  res.status(404).json({error:'Sin resultados para: '+q});
});

// ════════════════════════════════════════
//  SESIONES ACTIVAS (heartbeat)
// ════════════════════════════════════════

app.post('/api/session/ping', (req, res) => {
  const { username, name, role, seccion } = req.body;
  if (!username) return res.status(400).json({error:'Falta username'});
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const now_ = nowStr();
  db.prepare(`INSERT INTO sesiones (username,name,role,seccion,lastPing,sessionStart,ip)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(username) DO UPDATE SET
      seccion=excluded.seccion, lastPing=excluded.lastPing, ip=excluded.ip,
      name=excluded.name, role=excluded.role`
  ).run(username, name||username, role||'—', seccion||'dashboard', now_,
    db.prepare('SELECT sessionStart FROM sesiones WHERE username=?').get(username)?.sessionStart || now_, ip);
  res.json({ok:true});
});

app.get('/api/session/activos', (req, res) => {
  // Activos = ping en los últimos 2 minutos
  // SQLite datetime comparison
  const activos = db.prepare(`SELECT * FROM sesiones ORDER BY lastPing DESC`).all();
  const now_ = new Date();
  const filtered = activos.filter(s => {
    try {
      // lastPing format: "DD/MM/YY HH:MM"
      const parts = s.lastPing.match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/);
      if (!parts) return false;
      const [,d,m,y,h,min] = parts;
      const t = new Date(2000+parseInt(y), parseInt(m)-1, parseInt(d), parseInt(h), parseInt(min));
      return (now_ - t) < 2 * 60 * 1000; // 2 minutos
    } catch(e) { return false; }
  });
  res.json(filtered);
});

app.delete('/api/session/:username', (req, res) => {
  db.prepare('DELETE FROM sesiones WHERE username=?').run(req.params.username);
  res.json({ok:true});
});

// ── AUDIT ─────────────────────────────────
app.get('/api/audit',(req,res)=>res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 500').all()));
app.delete('/api/audit',(req,res)=>{db.prepare('DELETE FROM audit').run();res.json({ok:true});});

// ── EXPORTAR ──────────────────────────────
app.get('/api/export/products',(req,res)=>res.json(db.prepare('SELECT * FROM products').all().map(p=>({...p,stock:stockOf(p.sku),stock2da:stock2daOf(p.sku)}))));
app.get('/api/export/seriales',(req,res)=>res.json(req.query.sku?db.prepare('SELECT * FROM seriales WHERE sku=?').all(req.query.sku):db.prepare('SELECT * FROM seriales').all()));
app.get('/api/export/movimientos',(req,res)=>res.json(db.prepare('SELECT * FROM movimientos ORDER BY date DESC').all()));
app.get('/api/export/devoluciones',(req,res)=>res.json(db.prepare('SELECT d.*,p.name as productName FROM devoluciones d LEFT JOIN products p ON d.sku=p.sku ORDER BY fechaIngreso DESC').all()));
app.get('/api/export/segunda',(req,res)=>res.json(db.prepare('SELECT s.*,p.name as skuName FROM segunda_seleccion s LEFT JOIN products p ON s.sku=p.sku ORDER BY s.fechaIngreso DESC').all().map(x=>({...x,imagenes:JSON.parse(x.imagenes||'[]').length+' fotos'}))));

// ── HEALTH ────────────────────────────────
app.get('/api/health',(req,res)=>res.json({
  status:'ok',version:'2.2.0',db:'SQLite → database.db',ip:getLocalIP(),port:PORT,
  stats:{
    products:   db.prepare('SELECT COUNT(*) as n FROM products').get().n,
    seriales:   db.prepare('SELECT COUNT(*) as n FROM seriales').get().n,
    movimientos:db.prepare('SELECT COUNT(*) as n FROM movimientos').get().n,
    devoluciones:db.prepare('SELECT COUNT(*) as n FROM devoluciones').get().n,
    segunda:    db.prepare('SELECT COUNT(*) as n FROM segunda_seleccion').get().n,
    audit:      db.prepare('SELECT COUNT(*) as n FROM audit').get().n,
  },
  uptime:Math.round(process.uptime())+'s'
}));

module.exports = app;

if(require.main===module){
  const IP=getLocalIP();
  app.listen(PORT,'0.0.0.0',()=>{
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║  LuBabycas v2.2 — SQLite + 2da Selec.  ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log('  ║  PC:  http://localhost:'+PORT+'/login.html    ║');
    console.log('  ║  Red: http://'+IP+':'+PORT+'/login.html  ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}
