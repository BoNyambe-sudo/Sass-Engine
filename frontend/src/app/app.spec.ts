import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ApiService } from './core/api.service';
import { signal } from '@angular/core';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: ApiService, useValue: { session: signal(null) } },
      ],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should format member initials', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance.memberInitials('Maya Chen')).toBe('MC');
  });
});
