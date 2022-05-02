import { Toast as BootstrapToast } from "react-bootstrap";

export enum TOAST_TYPE {
  Error,
}

const Toast = ({ type, body, show, onClose }: { type: TOAST_TYPE, body: string, show: boolean, onClose: () => void }) => {
    return (
        <BootstrapToast onClose={onClose} show={show} delay={10000} bg={'warning'} autohide>
          <BootstrapToast.Header>
            <strong className="me-auto">Помилка</strong>
          </BootstrapToast.Header>
          <BootstrapToast.Body>{body}</BootstrapToast.Body>
        </BootstrapToast>
    )
}

export default Toast;
