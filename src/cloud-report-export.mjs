// Exportación de informes a CSV compatible con Excel en Chile.
// Solo exporta informes de períodos consultados sin truncamiento.
const safeNum=n=>{
 const value=Number(n);
 if(!Number.isSafeInteger(value))throw Error('Valor numérico inválido al exportar informe');
 return String(value);
};
function field(value){
 const raw=String(value??'');
 // No permitir fórmulas en planillas al abrir nombres/categorías de usuarios.
 const hardened=/^[\s\t\r\n]*[=+\-@]/.test(raw)?"'"+raw:raw;
 return '"'+hardened.replaceAll('"','""').replace(/[\r\n]+/g,' ')+'"';
}
function csvLine(...cells){return cells.map(field).join(';')}
export function reportCsv(report,{showCash=false}={}){
 if(!report||!Array.isArray(report.products)||!Array.isArray(report.byDay))
  throw Error('Informe no válido');
 if(report.partialOrders||report.partialCash)throw Error('No se exporta un informe parcial: reduce el rango de fechas');
 const rows=[
  ['GULA · INFORME COMPARTIDO'],
  ['Fecha desde',report.from||''],['Fecha hasta',report.to||''],
  ['Fecha utilizada para comandas',report.dateType==='created'?'Pedido':'Entrega'],
  [],
  ['RESUMEN','Monto CLP / Cantidad'],
  ['Comandas activas',safeNum(report.activeCount)],
  ['Comandas anuladas',safeNum(report.canceled)],
  ['Ventas en comandas seleccionadas',safeNum(report.sales)],
  ['Saldos pendientes de las comandas',safeNum(report.receivable)],
  ['Devoluciones pendientes',safeNum(report.refundPending)]
 ];
 if(showCash)rows.push(
  ['Pagos recibidos en período',safeNum(report.payments)],
  ['Devoluciones efectuadas en período',safeNum(report.refunds)],
  ['Ingresos efectivo',safeNum(report.cashIn)],
  ['Egresos efectivo',safeNum(report.cashOut)],
  ['Ingresos TEF',safeNum(report.tefIn)],
  ['Egresos TEF',safeNum(report.tefOut)],
  ['Retiros',safeNum(report.withdrawals)],
  ['Otros gastos',safeNum(report.expenses)]);
 rows.push([],['PRODUCTOS','Unidades','Importe CLP']);
 for(const p of report.products)rows.push([p.name,safeNum(p.units),safeNum(p.total)]);
 rows.push([],['VENTAS POR FECHA','Comandas','Total CLP']);
 for(const row of report.byDay)rows.push([row.day,safeNum(row.orders),safeNum(row.total)]);
 return '\ufeff'+rows.map(row=>csvLine(...row)).join('\r\n')+'\r\n';
}
export function downloadReportCsv(report,{showCash=false}={}){
 const csv=reportCsv(report,{showCash});
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;
 link.download='Gula_Informe_'+(report.from||'inicio')+'_'+(report.to||'fin')+'.csv';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
