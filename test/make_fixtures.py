# Writes made-up DBS-style statements (two accounts with transfers between them, plus an overlapping export) into the folder given as argv[1].
import sys, os
import random, datetime as dt
random.seed(4)
def csv(acct, rows):
    out=[f'Account Details For:,POSB Savings Account {acct}',f'Statement as at:,15 Oct 2026','','Transaction Date,Statement Code,Description,Debit Amount,Credit Amount']
    for d,code,desc,amt in sorted(rows):
        out.append(f'{d.strftime("%d %b %Y")},{code},"{desc}",{-amt if amt<0 else ""},{amt if amt>0 else ""}')
    return "\n".join(out)+"\n"
A=[];B=[]
start=dt.date(2026,7,1)
for i in range(107):
    d=start+dt.timedelta(days=i)
    if d.day==3: A.append((d,'ICT','INCOMING PAYNOW REF FROM: HO LENG LEE OTHR',1005.0))
    if d.day==20: A.append((d,'POS',f'GOOGLE STORAGE SI SGP {d.day-1}{d.strftime("%b").upper()}',-2.79))
    if d.day==12: A.append((d,'POS',f'SPOTIFY P3D2A SI SGP {d.day}{d.strftime("%b").upper()}',-11.98))
    if random.random()<.5: A.append((d,'POS',f'KENTUCKY FRIED CHICKEN SI SGP {(d-dt.timedelta(days=1)).day}{(d-dt.timedelta(days=1)).strftime("%b").upper()}',-round(random.uniform(8,15),2)))
    if random.random()<.3: A.append((d,'MST',f'BUS/MRT 94315{i} SI SGP',-round(random.uniform(2,9),2)))
    if random.random()<.15: A.append((d,'POS','SHOPEE SG MP SINGAPORE SGP',-round(random.uniform(10,120),2)))
    if random.random()<.08: A.append((d,'ICT',f'PayNow Transfer {600000+i} To: JOHN TAN OTHR',-round(random.choice([20,35,50]),2)))
    if d.day in (5,19):
        amt=float(random.choice([500,800,1200]))
        A.append((d,'ITR','FUND TRANSFER TO 245-004147-0',-amt)); B.append((d+dt.timedelta(days=1),'ITR','FUND TRANSFER FROM 123-45692-9',amt))
    if d.day==8: B.append((d,'IDT','IBKR SINGAPORE PTE LTD FAST TRF',-1000.0))
    if d.day==25: A.append((d,'ICT','PayNow Transfer 8842 To: INFINITE FLORIST PTE LTD OTHR',-68.0))
# two identical kopi same day to test counting
A.append((dt.date(2026,9,9),'POS','YA KUN KAYA TOAST SI SGP 08SEP',-1.5)); A.append((dt.date(2026,9,9),'POS','YA KUN KAYA TOAST SI SGP 08SEP',-1.5))
open(os.path.join(sys.argv[1],'acctA.csv'),'w').write(csv('123-45692-9',A))
open(os.path.join(sys.argv[1],'acctB.csv'),'w').write(csv('245-004147-0',B))
# overlap file: Sep 1 - Oct 15 of A again
open(os.path.join(sys.argv[1],'acctA_overlap.csv'),'w').write(csv('123-45692-9',[r for r in A if r[0]>=dt.date(2026,9,1)]))
print(len(A),len(B))
