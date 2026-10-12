/** Synchronous host adapter for locally compiled graphs. No mock or persistence fallback.
 * One session owns one accepted graph. Hosts persist snapshots separately and must
 * coordinate cross-tab/process writes; this class grants no multi-user authority.
 */
export interface PreparedGraph<T> { readonly graph: unknown; readonly artifact: T; readonly valid: boolean; readonly baseRevision: number; }
export class PortableGraphSession<T> {
  private revisionValue=0;
  private acceptedValue: PreparedGraph<T>;
  private candidates=new WeakMap<object,number>();
  constructor(graph:unknown,private readonly compile:(graph:unknown)=>{artifact:T;valid:boolean}) {
    this.acceptedValue=this.prepare(graph);
    if(!this.acceptedValue.valid)throw new Error('Invalid initial graph');
  }
  get revision():number{return this.revisionValue}
  get graph():unknown{return structuredClone(this.acceptedValue.graph)}
  get artifact():T{return this.acceptedValue.artifact}
  prepare(graph:unknown):PreparedGraph<T>{const source=structuredClone(graph),result=this.compile(source);
    const prepared={graph:source,artifact:result.artifact,valid:result.valid,baseRevision:this.revisionValue};this.candidates.set(prepared,this.revisionValue);return prepared;}
  commit(candidate:PreparedGraph<T>,expectedRevision:number):T{
    if(this.candidates.get(candidate)!==this.revisionValue||candidate.baseRevision!==this.revisionValue||expectedRevision!==this.revisionValue)throw new Error('HEAD_CONFLICT: stale graph proposal');
    // Compile again so edited candidate data cannot bypass host validation.
    const verified=this.prepare(candidate.graph);if(!verified.valid)throw new Error('PUBLICATION_BLOCKED: failed geometric checks');
    this.acceptedValue=verified;this.revisionValue++;this.candidates.delete(candidate);return verified.artifact;
  }
  restore(graph:unknown,revision:number):void{
    if(!Number.isSafeInteger(revision)||revision<0)throw new Error('Invalid revision');
    const prepared=this.prepare(graph);if(!prepared.valid)throw new Error('Invalid restored graph');
    this.acceptedValue=prepared;this.revisionValue=revision;this.candidates=new WeakMap<object,number>();
  }
}
