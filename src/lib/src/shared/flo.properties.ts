import { dia } from 'jointjs';
import { ValidatorFn, AsyncValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms'
import { Flo } from './../shared/flo.common';
import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable';

export namespace Properties {

  export enum InputType {
    TEXT,
    NUMBER,
    SELECT,
    CHECKBOX,
    PASSWORD,
    EMAIL,
    URL,
    CODE
  }

  export interface Property {
    id : string;
    name : string;
    attr : string;
    description? : string;
    defaultValue? : any;
    value? : any;
    readonly metadata? : Flo.PropertyMetadata;
  }

  export interface SelectOption {
    name: string;
    value: any;
  }

  export interface ErrorData {
    id : string;
    message : string;
  }

  export interface Validation {
    validator?: ValidatorFn|ValidatorFn[]|null,
    asyncValidator?: AsyncValidatorFn|AsyncValidatorFn[]|null,
    errorData? : Array<ErrorData>;
  }

  export interface ControlModel<T> {
    readonly type : InputType;
    readonly id : string;
    value : T;
    readonly defaultValue : T;
    readonly name? : string;
    readonly description? : string;
    readonly property : Property
    readonly validation? : Validation;
  }

  export class GenericControlModel<T> implements ControlModel<T> {

    constructor(private _property : Property, public type : InputType, public validation? : Validation) {}

    get id() {
      return this.property.id;
    }

    get name() {
      return this.property.name;
    }

    get description() {
      return this.property.description;
    }

    get defaultValue() {
      return this.property.defaultValue;
    }

    get value() : T {
      return <T> this.property.value;
    }

    set value(value : T) {
      this.property.value = value;
    }

    get property() : Property {
      return this._property;
    }

  }

  export class GenericListControlModel extends GenericControlModel<string> {

    constructor(property : Property, validation? : Validation) {
      super(property, InputType.TEXT, validation);
    }

    get value() : string {
      return this.property.value ? this.property.value.join(', ') : '';
    }

    set value(value : string) {
      this.property.value = value && value.trim() ? value.split(/\s*,\s*/) : undefined;
    }

  }

  export class SelectControlModel extends GenericControlModel<any> {
    constructor(_property : Property, type : InputType, public options : Array<SelectOption>) {
      super(_property, type);
    }
  }

  export class PropertiesGroupModel {

    protected cell : dia.Cell;

    protected controlModels : Array<ControlModel<any>>;

    protected loading : boolean = true;

    protected _loadedSubject : Subject<boolean>;

    constructor(cell : dia.Cell) {
      this.cell = cell;
    }

    load() {
      this.loading = true;
      this._loadedSubject = new Subject<boolean>();
      this.createProperties().then(properties => {
        this.controlModels = properties.map(p => this.createControlModel(p));
        this.loading = false;
        this._loadedSubject.next(true);
        this._loadedSubject.complete();
      });
    }

    get isLoading() : boolean {
      return this.loading;
    }

    get loadedSubject() {
      return this._loadedSubject;
    }

    getControlsModels() {
      return this.controlModels;
    }

    protected createProperties() : Promise<Array<Property>> {
      let metadata : Flo.ElementMetadata = this.cell.attr('metadata');
      return Promise.resolve(metadata.properties().then(propsMetadata => Array.from(propsMetadata.values()).map(m => this.createProperty(m))));
    }

    protected createProperty(metadata : Flo.PropertyMetadata) : Property {
      return {
        id: metadata.id,
        name: metadata.name,
        defaultValue: metadata.defaultValue,
        attr: `props/${metadata.name}`,
        value: this.cell.attr(`props/${metadata.name}`),
        description: metadata.description,
        metadata: metadata
      }
    }

    protected createControlModel(property : Property) : ControlModel<any> {
      return new GenericControlModel(property, InputType.TEXT);
    }

    public applyChanges() : void {
      if (this.loading) {
        return;
      }

      let properties = this.controlModels.map(cm => cm.property);

      this.cell.trigger('batch:start', { batchName: 'update properties' });

      properties.forEach(property => {
        if ((typeof property.value === 'boolean' && !property.defaultValue && !property.value) ||
          (property.value === property.defaultValue || property.value === '' || property.value === undefined || property.value === null)) {
          let currentValue = this.cell.attr(property.attr);
          if (currentValue !== undefined && currentValue !== null) {
            // Remove attr doesn't fire appropriate event. Set default value first as a workaround to schedule DSL resync
            this.cell.attr(property.attr, property.defaultValue === undefined ? null : property.defaultValue);
            this.cell.removeAttr(property.attr);
          }
        } else {
          this.cell.attr(property.attr, property.value);
        }
      });

      this.cell.trigger('batch:stop', { batchName: 'update properties' });
    }

  }

  export namespace Validators {

    export function uniqueResource(service : (value : any) => Observable<any>, debounce : number): AsyncValidatorFn {
      return (control: AbstractControl): Observable<ValidationErrors> => {
        return new Observable(obs => {
          if (control.valueChanges && control.value) {
            control.valueChanges
              .debounceTime(debounce)
              .flatMap(value => service(value))
              .subscribe(() => {
                obs.next({uniqueResource: true});
                obs.complete();
              }, () => {
                obs.next(null);
                obs.complete();
              })
          } else {
            obs.next(null);
            obs.complete();
          }
        });
      }
    }

    export function noneOf(excluded : Array<any>) : ValidatorFn {
      return (control: AbstractControl) : {[key: string]: any} => {
        return excluded.find(e => e === control.value) ? {'noneOf': {value: control.value}} : null;
      };
    }

  }

}
