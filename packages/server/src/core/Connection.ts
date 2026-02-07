import { Socket } from "socket.io";
import { User } from "sockr-shared";

export class Connection {
  private socket: Socket;
  private user: User | null = null;
  private isAuthenticated: boolean = false;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public authenticate(user: User) {
    this.user = user;
    this.isAuthenticated = true;
  }

  public getUser(): User | null {
    return this.user;
  }

  public getUserId(): string | null {
    return this.user?.id || null;
  }

  public getSocketId(): string {
    return this.socket.id;
  }

  public isAuth(): boolean {
    return this.isAuthenticated;
  }

  public emit(event: string, data: any): void {
    this.socket.emit(event, data);
  }

  public disconnect(): void {
    this.socket.disconnect();
  }

  public getSocket(): Socket {
    return this.socket;
  }
}