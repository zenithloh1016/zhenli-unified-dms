/**
 * Bilingual, display-only wording for the UNICOSEC Annual Return review.
 * The canonical item.en/item.cn keys MUST remain unchanged: the editor,
 * imports, register sync, saved drafts and export routines depend on them.
 * User-edited displayEn/displayCn always take precedence.
 */
export const DEFAULT_WORDING=Object.freeze({
 'Former Name':['Former Company Name (if any)','公司曾用名称（如有）'],
 'Company Registration No.':['Company Registration Number','公司注册号码'],
 'Anniversary Date':['Annual Return Anniversary Date','周年申报基准日'],
 'Registered Office':['Registered Office Address','注册办事处地址'],
 'Address Where Register of Members Is Kept':['Location of Register of Members','股东名册存放地址'],
 'Principal Place of Business':['Principal Business Address','主要营业地址'],
 'Address Where Financial Records Are Kept':['Location of Financial Records','财务记录存放地址'],
 'Nature of Business / MSIC Code':['Nature of Business and MSIC Code(s)','业务性质及 MSIC 行业代码'],
 'Type of Shares Issued':['Basis of Share Issue (Cash / Non-cash)','股份发行对价方式（现金／非现金）'],
 'Classes of Shares Issued':['Classes of Issued Shares','已发行股份类别'],
 'Number of Ordinary Shares':['Number of Issued Ordinary Shares','已发行普通股数量'],
 'Number of Preference Shares':['Number of Issued Preference Shares','已发行优先股数量'],
 'Total Number of Issued Shares (all classes)':['Total Issued Shares (All Classes)','全部类别已发行股份总数'],
 'Ordinary Share Capital (recorded amount paid)':['Ordinary Share Capital — Amount Paid','普通股股本－已缴金额'],
 'Preference Share Capital (recorded amount paid)':['Preference Share Capital — Amount Paid','优先股股本－已缴金额'],
 'Aggregate Amount Paid on Allotments (verify share capital)':['Total Amount Paid on Share Allotments','股份配发已缴总额'],
 'Shares Issued for Cash (ordinary)':['Ordinary Shares Issued for Cash','以现金发行的普通股'],
 'Shares Issued Otherwise Than in Cash':['Shares Issued for Non-cash Consideration','以非现金对价发行的股份'],
 'Amount Considered Paid on Non-Cash Allotment':['Amount Treated as Paid on Non-cash Allotments','非现金配发视为已缴金额'],
 'Amount of Shares Partly Unpaid':['Unpaid Amount on Partly Paid Shares','未缴足股份的未付金额'],
 'Total Calls Called Up / Received':['Share Calls — Amount Called Up / Received','股份催缴款项－已催缴／已收取金额'],
 'Registered No.':['Charge Registration Number','押记登记编号'],
 'Date of Registration':['Charge Registration Date','押记登记日期'],
 'Current Outstanding Indebtedness':['Outstanding Indebtedness','未偿还债务'],
 'Service / Business Address':['Service or Business Address','通讯／营业地址'],
 'Practising Certificate Number':['SSM Practising Certificate Number','SSM 执业证书编号'],
 'Audit Firm Registration No.':['Audit Firm Registration Number','审计师事务所注册号码'],
 'Member Folio':['Register of Members — Folio Number','股东名册编号'],
 'Member Type':['Member Type (Individual / Corporate)','股东类别（个人／公司）'],
 'Percentage of Own Share Class':['Percentage Held Within Share Class (%)','所持同类别股份比例（%）'],
 'Voting / Other Share Rights':['Voting Rights and Other Rights Attached to Shares','股份所附表决权及其他权利'],
 'Recorded Ownership / Voting Rights Percentage':['Ownership and/or Voting Rights (%)','股权及／或表决权比例（%）'],
 'Type of Beneficial Ownership':['Type of Beneficial Ownership (Direct / Indirect)','实益拥有权类型（直接／间接）'],
 'Criteria of Beneficial Ownership':['Applicable Beneficial Ownership Criteria','适用的实益拥有权标准']
});
export function preferredParticularLabel(item,language='en'){
 const override=language==='cn'?'displayCn':'displayEn';
 const fallback=language==='cn'?'cn':'en';
 if(typeof item?.[override]==='string')return item[override];
 const original=String(item?.en??'').trim();
 const wording=DEFAULT_WORDING[original];
 return wording?wording[language==='cn'?1:0]:String(item?.[fallback]??'');
}
