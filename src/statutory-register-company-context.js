/**
 * The Documents company's current name/number is the authoritative identity
 * for statutory register headings and exported PDFs. Historical workbook
 * metadata and archived source filenames must not override a renamed company.
 * This is a read-only projection; source worksheets and previous versions are
 * never mutated by rendering.
 */
export function currentCompanyRegisterView(book,company){
 if(!book)return null;
 if(!company||!company.id||String(company.id)!==String(book.companyId))return book;
 return {
  ...book,
  companyName:String(company.name||book.companyName||'').trim(),
  registrationNo:String(company.registration_no||book.registrationNo||'').trim()
 };
}
