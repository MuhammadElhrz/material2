/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ComponentPortal, Portal, CdkPortal, InlinePortal} from '@angular/cdk/portal';
import {Component, QueryList, ViewChildren, ElementRef, ViewChild} from '@angular/core';


@Component({
  moduleId: module.id,
  selector: 'portal-demo',
  templateUrl: 'portal-demo.html',
  styleUrls: ['portal-demo.css'],
})
export class PortalDemo {
  @ViewChildren(CdkPortal) templatePortals: QueryList<Portal<any>>;
  @ViewChild('inlinePortalSource') inlinePortalSource: ElementRef<HTMLElement>;

  selectedPortal: Portal<any>;

  get programmingJoke() {
    return this.templatePortals.first;
  }

  get mathJoke() {
    return this.templatePortals.last;
  }

  get scienceJoke() {
    return new ComponentPortal(ScienceJoke);
  }

  get dadJoke() {
    return new InlinePortal(this.inlinePortalSource);
  }
}


@Component({
  moduleId: module.id,
  selector: 'science-joke',
  template: `<p> 100 kilopascals go into a bar. </p>`
})
export class ScienceJoke { }
